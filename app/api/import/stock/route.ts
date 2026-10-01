import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { badRequest, isObjectId, toNumber } from '@/lib/validation';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const runtime = 'nodejs';

function cleanVal(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return badRequest('Please upload an Excel (.xlsx / .xls) or CSV stock file');
    if (file.size === 0) return badRequest('The uploaded file is empty');
    if (file.size > MAX_FILE_BYTES) return badRequest('File is too large (max 10 MB)');

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Excel/CSV file appears to be empty' }, { status: 400 });
    }

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return NextResponse.json({ error: 'Excel/CSV sheet contains no data' }, { status: 400 });
    }

    // 1. Detect header row index flexibly
    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};

    const kwScore = (str: string) => {
      const s = str.toLowerCase();
      let score = 0;
      if (/sku|code|asin|fsn|ean|article|material|barcode|partnumber|part\s*number|item\s*code|product\s*code/i.test(s)) score += 3;
      if (/particulars|desc|title|name|item|product|material\s*desc/i.test(s)) score += 3;
      if (/qty|quantity|closing|stock|units|pcs|pc's|available/i.test(s)) score += 3;
      if (/brand/i.test(s)) score += 2;
      if (/group|category|catg|grp/i.test(s)) score += 2;
      return score;
    };

    let maxScore = 0;
    for (let i = 0; i < Math.min(rawData.length, 25); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      let totalScore = 0;
      row.forEach(cell => {
        if (cell) totalScore += kwScore(String(cell));
      });

      if (totalScore >= 4 && totalScore > maxScore) {
        maxScore = totalScore;
        headerRowIdx = i;
      }
    }

    if (headerRowIdx === -1) {
      // findIndex returns -1 (truthy) when nothing is found, so check explicitly
      const firstWide = rawData.findIndex(r => r && Array.isArray(r) && r.length > 1);
      headerRowIdx = firstWide >= 0 ? firstWide : 0;
    }

    // Check multi-row headers: the header row first, then up to 2 rows above it (e.g. Tally's
    // "Closing Balance" over "Quantity | Rate | Value"). The header row wins on conflicts.
    for (let rIdx = headerRowIdx; rIdx >= Math.max(0, headerRowIdx - 2); rIdx--) {
      const row = rawData[rIdx];
      if (row && Array.isArray(row)) {
        row.forEach((cell: any, idx: number) => {
          if (cell !== null && cell !== undefined) {
            const key = String(cell).trim().toLowerCase();
            if (key && colMap[key] === undefined) {
              colMap[key] = idx;
            }
          }
        });
      }
    }

    const getIdx = (...terms: string[]) => {
      for (const term of terms) {
        const exact = Object.keys(colMap).find(k => k === term.toLowerCase());
        if (exact !== undefined) return colMap[exact];
      }
      for (const term of terms) {
        const partial = Object.keys(colMap).find(k => k.includes(term.toLowerCase()));
        if (partial !== undefined) return colMap[partial];
      }
      return -1;
    };

    let skuIdx = getIdx('sku / code', 'sku', 'partnumber', 'part number', 'code', 'barcode', 'ean', 'item code', 'product code', 'material');
    let nameIdx = getIdx('particulars', 'product name', 'item description', 'description', 'title', 'name', 'item');
    const brandIdx = getIdx('brand');
    const groupIdx = getIdx('group', 'category', 'catg');
    const qtyIdx = getIdx('closing quantity (pcs)', 'quantity (pcs)', 'stock quantity', 'closing stock', 'closing quantity', 'closing balance', 'quantity', 'qty', 'pcs', "pc's", 'available', 'balance');

    if (qtyIdx === -1) {
      return badRequest('Could not find a Quantity / Closing Stock column in the file. Please check the header row.');
    }

    // Fallback: analyze sample data rows to find the true item description column
    let detectedTextCol = -1;
    for (let r = headerRowIdx + 1; r < Math.min(rawData.length, headerRowIdx + 10); r++) {
      const row = rawData[r];
      if (!row || !Array.isArray(row)) continue;

      for (let c = 0; c < row.length; c++) {
        const cellVal = String(row[c] || '').trim();
        if (cellVal.length > 5 && !/^\d+$/.test(cellVal) && !cellVal.includes('/PCS') && !cellVal.includes('/KG') && !cellVal.toLowerCase().includes('grand total')) {
          detectedTextCol = c;
          break;
        }
      }
      if (detectedTextCol !== -1) break;
    }

    // Only guess the name column from data when no name header was found
    if (nameIdx === -1 && detectedTextCol !== -1) {
      nameIdx = detectedTextCol;
    }
    if (nameIdx === -1 && skuIdx === -1) {
      return badRequest('Could not find an Item Name / Particulars or SKU column in the file.');
    }

    // Fetch active ItemMappings for mapping & enrichment
    const allMappings = await prisma.itemMapping.findMany({ where: { isActive: true } });

    // Rows are collected first so the same SKU appearing twice is summed, not overwritten
    const rowsBySku = new Map<string, { sku: string; name: string; brand: string | null; group: string | null; quantity: number }>();
    let skippedRows = 0;

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      const firstCell = String(row[0] || '').trim().toLowerCase();
      const secondCell = String(row[1] || '').trim().toLowerCase();
      if (firstCell.includes('grand total') || secondCell.includes('grand total') || firstCell === 'total' || secondCell === 'total') {
        continue;
      }

      const rawSku = skuIdx >= 0 && row[skuIdx] !== undefined ? cleanVal(row[skuIdx]) : '';
      const rawName = nameIdx >= 0 && row[nameIdx] !== undefined ? cleanVal(row[nameIdx]) : '';
      const rawBrand = brandIdx >= 0 && row[brandIdx] !== undefined ? cleanVal(row[brandIdx]) : '';
      const rawGroup = groupIdx >= 0 && row[groupIdx] !== undefined ? cleanVal(row[groupIdx]) : '';
      const rawQty = qtyIdx >= 0 && row[qtyIdx] !== undefined ? cleanVal(row[qtyIdx]) : '0';

      let name = rawName;
      let sku = rawSku;

      if (!name || /^\d+$/.test(name)) {
        name = rawSku;
      }
      // Numeric codes (EAN / barcode / item codes) are valid SKUs; only fall back to the name when empty
      if (!sku) {
        sku = name;
      }

      if (!sku && !name) continue;
      if (name.includes('/PCS') || name.includes('/KG') || name.toLowerCase() === 'particulars') continue;

      const parsedQty = toNumber(rawQty);
      if (parsedQty === null) { skippedRows++; continue; }
      const quantity = Math.max(0, Math.round(parsedQty));

      // Try item mapping matching
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. Exact / high confidence match
      let mapping = allMappings.find(m => {
        const mName = (m.tallyItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const mChainName = (m.chainItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const mCompName = (m.companyItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const mCompCode = (m.companyItemCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        if (mName && mName.length > 3 && cleanName === mName) return true;
        if (mChainName && mChainName.length > 3 && cleanName === mChainName) return true;
        if (mCompName && mCompName.length > 3 && cleanName === mCompName) return true;
        if (mCompCode && mCompCode.length > 3 && cleanName === mCompCode) return true;
        return false;
      });

      // 2. Partial match if exact match not found (only for reasonably specific names,
      //    otherwise a short name like "oil" would match an unrelated mapping)
      if (!mapping && cleanName.length >= 8) {
        mapping = allMappings.find(m => {
          const mName = (m.tallyItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const mChainName = (m.chainItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const mCompName = (m.companyItemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

          if (mName && mName.length >= 8 && (cleanName.includes(mName) || mName.includes(cleanName))) return true;
          if (mChainName && mChainName.length >= 8 && (cleanName.includes(mChainName) || mChainName.includes(cleanName))) return true;
          if (mCompName && mCompName.length >= 8 && (cleanName.includes(mCompName) || mCompName.includes(cleanName))) return true;
          return false;
        });
      }

      const finalSku = mapping?.tallyItemSku || mapping?.companyItemCode || sku;
      const finalName = mapping?.tallyItemName || mapping?.companyItemName || name;
      const finalBrand = mapping?.brandName || rawBrand || (finalName.toLowerCase().includes('eastern') ? 'Eastern' : null);
      const finalGroup = rawGroup || null;

      const skuKey = finalSku.trim().toUpperCase();
      if (!skuKey) { skippedRows++; continue; }
      const prev = rowsBySku.get(skuKey);
      if (prev) {
        prev.quantity += quantity;
      } else {
        rowsBySku.set(skuKey, { sku: skuKey, name: finalName, brand: finalBrand, group: finalGroup, quantity });
      }
    }

    if (rowsBySku.size === 0) {
      return badRequest('No stock rows found in the file. Check that it has item names and quantities.');
    }

    let upserted = 0;
    for (const r of rowsBySku.values()) {
      const product = await prisma.product.upsert({
        where: { sku: r.sku },
        update: { name: r.name, ...(r.brand ? { brand: r.brand } : {}), ...(r.group ? { group: r.group } : {}) },
        create: { sku: r.sku, name: r.name, brand: r.brand, group: r.group }
      });

      const existing = await prisma.stock.findFirst({ where: { productId: product.id, location: 'TOTAL' } });
      const previousQty = existing?.quantity ?? 0;
      if (existing) {
        await prisma.stock.update({ where: { id: existing.id }, data: { quantity: r.quantity } });
      } else {
        await prisma.stock.create({
          data: {
            productId: product.id,
            location: 'TOTAL',
            quantity: r.quantity,
            minStock: product.minStockThreshold || 0
          }
        });
      }
      if (previousQty !== r.quantity) {
        await prisma.stockTransaction.create({
          data: {
            productId: product.id,
            type: r.quantity > previousQty ? 'IN' : 'OUT',
            quantity: Math.abs(r.quantity - previousQty),
            previousQty,
            newQty: r.quantity,
            reason: 'STOCK_IMPORT',
            notes: `Closing stock import: ${file.name}`,
          }
        });
      }
      upserted++;
    }

    return NextResponse.json({ ok: true, upserted, skippedRows });
  } catch (err: any) {
    console.error('❌ [STOCK IMPORT ERROR]', err);
    return NextResponse.json({ error: 'Failed to import stock: ' + (err.message || err) }, { status: 500 });
  }
}

// GET /api/import/stock - Fetch all imported stock items with product info
export async function GET() {
  try {
    const stocks = await prisma.stock.findMany({
      include: {
        product: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const items = stocks.map(s => ({
      id: s.id,
      productId: s.productId,
      sku: s.product.sku,
      name: s.product.name,
      brand: s.product.brand || '—',
      group: s.product.group || '—',
      quantity: s.quantity,
      updatedAt: s.updatedAt,
    }));

    const totalPcs = items.reduce((acc, curr) => acc + curr.quantity, 0);

    return NextResponse.json({
      success: true,
      totalItems: items.length,
      totalPcs,
      items
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch stock data: ' + err.message }, { status: 500 });
  }
}

// DELETE /api/import/stock - Delete stock entries completely
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const resetAll = searchParams.get('resetAll');

    if (resetAll === 'true') {
      const result = await prisma.stock.deleteMany({});
      return NextResponse.json({ success: true, message: `Deleted ${result.count} stock items completely` });
    }

    if (!id) {
      return NextResponse.json({ error: 'Stock ID or resetAll parameter required' }, { status: 400 });
    }

    if (!isObjectId(id)) return badRequest('Invalid stock id');
    const deleted = await prisma.stock.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Stock item deleted completely', deleted });
  } catch (err: any) {
    console.error('❌ [STOCK DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete stock item: ' + err.message }, { status: 500 });
  }
}
