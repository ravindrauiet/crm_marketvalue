import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { normalizeChain } from '@/lib/chains';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Column headers accepted for each field, best match first. Exact matches win over "contains",
// so "Company Item Code" is never read as the chain's "Item Code".
const COLUMNS: Record<string, string[]> = {
  chainName: ['chainname', 'chain', 'account'],
  chainItemCode: ['chainitemcode', 'chaincode', 'itemcode', 'sku', 'asin', 'fsn', 'materialcode'],
  chainItemName: ['chainitemname', 'itemname', 'productname', 'description'],
  tallyItemName: ['tallyitemname', 'tallyname'],
  tallyItemSku: ['tallyitemsku', 'tallysku'],
  eanCode: ['eancode', 'ean', 'barcode'],
  brandName: ['brandname', 'brand'],
  companyItemCode: ['companyitemcode', 'companycode'],
  companyItemName: ['companyitemname', 'companyname'],
  pcsPerCase: ['pcspercase', 'pcscase', 'casesize', 'conversion'],
  notes: ['notes', 'remarks'],
};

function resolveColumns(headers: string[]) {
  const used = new Set<string>();
  const out: Record<string, string | undefined> = {};
  // Exact header matches first for every field, then "contains" for the rest
  for (const exact of [true, false]) {
    for (const [field, patterns] of Object.entries(COLUMNS)) {
      if (out[field]) continue;
      for (const p of patterns) {
        const h = headers.find(h => !used.has(h) && (exact ? squash(h) === p : squash(h).includes(p)));
        if (h) { out[field] = h; used.add(h); break; }
      }
    }
  }
  return out;
}

// POST /api/item-mapping/upload — bulk add / update mappings from Excel or CSV
export async function POST(req: NextRequest) {
  try {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Please upload an Excel (.xlsx / .xls) or CSV file' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is too large (max 10 MB)' }, { status: 400 });

    // CSV cells stay text (leading zeros survive); Excel numbers come back as plain numbers, never "8.9E+12"
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', raw: true });
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 });

    const col = resolveColumns(Object.keys(rows[0]));
    if (!col.chainName || !col.chainItemCode) {
      return NextResponse.json({ error: 'The file needs at least "Chain Name" and "Chain Item Code" columns — download the sample format' }, { status: 400 });
    }
    const cell = (row: Record<string, unknown>, field: string) => (col[field] ? String(row[col[field]!] ?? '').trim() : '');

    const existing = await prisma.itemMapping.findMany();
    const byKey = new Map(existing.map(m => [`${m.chainName}::${m.chainItemCode.toLowerCase()}`, m]));

    const creates = new Map<string, any>();
    const updates = new Map<string, { id: string; data: any }>();
    const skipped: string[] = [];

    rows.forEach((row, i) => {
      const excelRow = i + 2;
      const chainName = normalizeChain(cell(row, 'chainName'));
      const chainItemCode = cell(row, 'chainItemCode');
      if (!chainName || !chainItemCode) { skipped.push(`Row ${excelRow}: chain or chain item code missing`); return; }

      const pcsText = cell(row, 'pcsPerCase');
      const pcs = pcsText ? Number(pcsText) : null;
      if (pcsText && (!Number.isInteger(pcs) || pcs! < 1)) { skipped.push(`Row ${excelRow}: PCS per case "${pcsText}" is not a whole number`); return; }

      const values: Record<string, any> = {};
      for (const f of ['chainItemName', 'tallyItemName', 'tallyItemSku', 'eanCode', 'brandName', 'companyItemCode', 'companyItemName', 'notes']) {
        const v = cell(row, f);
        if (v) values[f] = v; // blank cells keep the existing value
      }
      if (pcs) values.pcsPerCase = pcs;

      const key = `${chainName}::${chainItemCode.toLowerCase()}`;
      const current = byKey.get(key);
      if (current) {
        // Re-uploading a deleted mapping brings it back
        const prev = updates.get(key)?.data || {};
        updates.set(key, { id: current.id, data: { ...prev, ...values, isActive: true } });
      } else {
        const merged = { ...(creates.get(key) || {}), ...values };
        if (!merged.chainItemName || !merged.tallyItemName) { skipped.push(`Row ${excelRow}: new mapping needs Chain Item Name and Tally Item Name`); return; }
        creates.set(key, { pcsPerCase: 1, ...merged, chainName, chainItemCode, isActive: true });
      }
    });

    if (creates.size) await prisma.itemMapping.createMany({ data: [...creates.values()] });
    const updateList = [...updates.values()];
    for (let i = 0; i < updateList.length; i += 50) {
      await prisma.$transaction(updateList.slice(i, i + 50).map(u => prisma.itemMapping.update({ where: { id: u.id }, data: u.data })));
    }

    return NextResponse.json({
      success: true,
      created: creates.size,
      updated: updates.size,
      skipped: skipped.length,
      skippedRows: skipped.slice(0, 20),
      totalProcessed: creates.size + updates.size,
    });
  } catch (err: any) {
    console.error('Item Mapping upload error:', err);
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 });
  }
}
