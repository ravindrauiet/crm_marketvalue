import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { parseDate, toNumber } from '@/lib/validation';
import { SALE_UPLOAD_WHERE } from '@/lib/billSources';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const WRITE_BATCH = 10; // invoices written in parallel per batch

// Local dev convenience: the sample Tally export kept next to the project
function readQuickImportFile(): { buffer: Buffer; name: string } | null {
  const filePath = path.join(process.cwd(), '..', 'Tally', 'SALE REPORT_JULY_.xls');
  return fs.existsSync(filePath) ? { buffer: fs.readFileSync(filePath), name: 'SALE REPORT_JULY_.xls' } : null;
}

export async function POST(req: NextRequest) {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = 'Tally_Sales_Report.xls';
    let quickImport = false;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      quickImport = formData.get('quickImport') === 'true';

      if (!quickImport && file instanceof File) {
        if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
          return NextResponse.json({ error: 'Please upload the Tally sale report as Excel (.xls / .xlsx) or CSV' }, { status: 400 });
        }
        if (file.size === 0) return NextResponse.json({ error: 'The uploaded file is empty' }, { status: 400 });
        if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is too large (max 15 MB)' }, { status: 400 });
        fileBuffer = Buffer.from(await file.arrayBuffer());
        fileName = file.name;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      quickImport = !!body.quickImport;
    }

    if (quickImport) {
      const q = readQuickImportFile();
      if (!q) return NextResponse.json({ error: 'Quick import is only available in local development (Tally/SALE REPORT_JULY_.xls not found)' }, { status: 404 });
      fileBuffer = q.buffer;
      fileName = q.name;
    }

    if (!fileBuffer) {
      return NextResponse.json({ error: 'No Excel file provided' }, { status: 400 });
    }

    // Read Workbook using SheetJS
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('sale')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ error: 'No readable sheet found in Excel workbook' }, { status: 400 });
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ error: 'Excel sheet is empty' }, { status: 400 });
    }

    // Find Header Row (row containing 'Vch No' or 'Party Name')
    let headerRowIndex = rawRows.findIndex(row =>
      Array.isArray(row) && row.some(cell => cell && String(cell).toLowerCase().includes('vch no'))
    );
    if (headerRowIndex === -1) {
      headerRowIndex = rawRows.findIndex(row =>
        Array.isArray(row) && row.some(cell => cell && String(cell).toLowerCase().includes('party name'))
      );
    }
    if (headerRowIndex === -1) {
      return NextResponse.json({ error: 'Could not find the header row (expected columns like "Vch No." and "Party Name")' }, { status: 400 });
    }

    const headers = rawRows[headerRowIndex].map(h => String(h || '').trim().toLowerCase());

    // Keywords are tried in priority order, so "order no" wins over a looser "order" match
    const getColIndex = (keywords: string[], exclude: number[] = []) => {
      for (const k of keywords) {
        const idx = headers.findIndex((h, i) => !exclude.includes(i) && h.includes(k));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const vchNoIdx = getColIndex(['vch no', 'vch. no', 'voucher no', 'invoice no', 'voucher', 'invoice']);
    const orderNoIdx = getColIndex(['order no', 'po no', 'po number', 'order']);
    const orderDateIdx = getColIndex(['order dt', 'order date']);
    const dateIdx = headers.findIndex((h, i) => i !== orderDateIdx && /(^|\s)date$|^date|^dt$/.test(h));
    const partyNameIdx = getColIndex(['party name', 'customer', 'party']);
    const itemNameIdx = getColIndex(['item name', 'stock item', 'product', 'description', 'particulars']);
    const qtyIdx = getColIndex(['quantity', 'qty']);
    const rateIdx = getColIndex(['rate', 'price']);
    const amountIdx = getColIndex(['amount', 'value', 'total']);

    if (vchNoIdx === -1) return NextResponse.json({ error: 'Could not find the "Vch No." (invoice number) column' }, { status: 400 });
    if (dateIdx === -1) return NextResponse.json({ error: 'Could not find the invoice "Date" column' }, { status: 400 });

    const dataRows = rawRows.slice(headerRowIndex + 1);

    // Group items by Invoice Number (Vch No)
    const invoicesMap = new Map<string, {
      invoiceNumber: string;
      invoiceDate: Date;
      poNumber: string;
      customerName: string;
      items: Array<{ itemName: string; quantity: number; rate: number; amount: number }>;
    }>();

    const uniqueDatesSet = new Set<string>();
    const badDateRows: number[] = [];

    dataRows.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length === 0) return;

      const vchNo = row[vchNoIdx] !== undefined && row[vchNoIdx] !== null ? String(row[vchNoIdx]).trim() : '';
      if (!vchNo || vchNo.toLowerCase().includes('total')) return;

      // Tally "continuation" lines leave the date blank: reuse the invoice's date
      const existingInvoice = invoicesMap.get(vchNo);
      const invoiceDate = parseDate(row[dateIdx]) || existingInvoice?.invoiceDate || null;
      if (!invoiceDate) {
        badDateRows.push(headerRowIndex + idx + 2); // 1-based Excel row number
        return;
      }
      uniqueDatesSet.add(invoiceDate.toISOString().split('T')[0]);

      let orderNo = orderNoIdx !== -1 && row[orderNoIdx] ? String(row[orderNoIdx]).trim() : '';
      // Clean order number e.g. PO#GGNPO370787 -> GGNPO370787
      orderNo = orderNo.replace(/^po\s*#?\s*/i, '').trim();

      const customerName = partyNameIdx !== -1 && row[partyNameIdx] ? String(row[partyNameIdx]).trim() : 'UNKNOWN';
      const itemName = itemNameIdx !== -1 && row[itemNameIdx] ? String(row[itemNameIdx]).trim() : 'Item';
      const quantity = qtyIdx !== -1 ? toNumber(row[qtyIdx]) ?? 0 : 0;
      const rate = rateIdx !== -1 ? toNumber(row[rateIdx]) ?? 0 : 0;
      const amount = amountIdx !== -1 ? (toNumber(row[amountIdx]) ?? quantity * rate) : (quantity * rate);

      if (!existingInvoice) {
        invoicesMap.set(vchNo, {
          invoiceNumber: vchNo,
          invoiceDate,
          poNumber: orderNo,
          customerName,
          items: []
        });
      }

      const invRecord = invoicesMap.get(vchNo)!;
      invRecord.items.push({ itemName, quantity, rate, amount });
      if (orderNo && !invRecord.poNumber) {
        invRecord.poNumber = orderNo;
      }
    });

    const parsedInvoices = Array.from(invoicesMap.values());
    if (parsedInvoices.length === 0) {
      const hint = badDateRows.length ? ` (${badDateRows.length} rows had an unreadable date, e.g. row ${badDateRows[0]})` : '';
      return NextResponse.json({ error: `No valid sales invoice records found in uploaded file${hint}` }, { status: 400 });
    }

    // Existing sale uploads for these invoice numbers (OCR purchase bills are never overwritten)
    const existingBills = await prisma.purchaseBill.findMany({
      where: { AND: [SALE_UPLOAD_WHERE, { invoiceNumber: { in: parsedInvoices.map(i => i.invoiceNumber) } }] },
      select: { id: true, invoiceNumber: true },
    });
    const existingByNumber = new Map(existingBills.map(b => [b.invoiceNumber, b.id]));

    let createdCount = 0;
    let updatedCount = 0;
    let totalBilledAmount = 0;

    const writeInvoice = async (inv: typeof parsedInvoices[number]) => {
      const invTotal = inv.items.reduce((sum, item) => sum + item.amount, 0);
      totalBilledAmount += invTotal;
      const itemsCreate = inv.items.map(item => ({
        itemName: item.itemName,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        tallyItemName: item.itemName,
        unit: 'PCS'
      }));
      const common = {
        invoiceDate: inv.invoiceDate,
        supplierName: inv.customerName,
        totalAmount: invTotal,
        notes: `PO:${inv.poNumber} | Party:${inv.customerName}`,
        status: 'VERIFIED',
        fileName,
      };

      const existingId = existingByNumber.get(inv.invoiceNumber);
      if (existingId) {
        await prisma.purchaseBill.update({
          where: { id: existingId },
          data: { ...common, items: { deleteMany: {}, create: itemsCreate } }
        });
        updatedCount++;
      } else {
        await prisma.purchaseBill.create({
          data: { ...common, invoiceNumber: inv.invoiceNumber, items: { create: itemsCreate } }
        });
        createdCount++;
      }
    };

    for (let i = 0; i < parsedInvoices.length; i += WRITE_BATCH) {
      await Promise.all(parsedInvoices.slice(i, i + WRITE_BATCH).map(writeInvoice));
    }

    const uniqueDatesList = Array.from(uniqueDatesSet).sort();
    const warning = badDateRows.length
      ? ` ${badDateRows.length} row(s) skipped because the date could not be read (e.g. Excel row ${badDateRows[0]}).`
      : '';

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${fileName}: ${parsedInvoices.length} Invoices reconciled across ${uniqueDatesList.length} dates.${warning}`,
      fileName,
      totalInvoicesProcessed: parsedInvoices.length,
      createdCount,
      updatedCount,
      skippedRows: badDateRows.length,
      totalBilledAmount,
      uploadedDates: uniqueDatesList,
    });
  } catch (err: any) {
    console.error('❌ [DAILY REPORT UPLOAD ERROR]', err);
    return NextResponse.json({ error: 'Failed to upload & reconcile daily report: ' + err.message }, { status: 500 });
  }
}
