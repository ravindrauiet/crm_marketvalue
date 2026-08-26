import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Helper to convert Excel serial date or string to Date object
function parseExcelDate(val: any): Date {
  if (!val) return new Date();
  if (typeof val === 'number') {
    // Excel serial date code
    const dateObj = XLSX.SSF.parse_date_code(val);
    if (dateObj) {
      return new Date(Date.UTC(dateObj.y, dateObj.m - 1, dateObj.d));
    }
  }
  if (val instanceof Date) return val;
  const str = String(val).trim();
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  // Try formats like 1-Jul-26 or 01/07/2026
  const parts = str.split(/[-/ ]/);
  if (parts.length === 3) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    let day = parseInt(parts[0], 10);
    let monthStr = parts[1].toLowerCase();
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    if (months[monthStr] !== undefined) {
      return new Date(Date.UTC(year, months[monthStr], day));
    }
  }

  return new Date();
}

export async function POST(req: NextRequest) {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = 'Tally_Sales_Report.xls';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const isQuickImport = formData.get('quickImport') === 'true';

      if (isQuickImport) {
        const filePath = path.join(process.cwd(), '..', 'Tally', 'SALE REPORT_JULY_.xls');
        if (fs.existsSync(filePath)) {
          fileBuffer = fs.readFileSync(filePath);
          fileName = 'SALE REPORT_JULY_.xls';
        } else {
          return NextResponse.json({ error: 'File Tally/SALE REPORT_JULY_.xls not found in project workspace' }, { status: 404 });
        }
      } else if (file) {
        const bytes = await file.arrayBuffer();
        fileBuffer = Buffer.from(bytes);
        fileName = file.name;
      }
    } else {
      // JSON payload requesting quick import
      const body = await req.json().catch(() => ({}));
      if (body.quickImport) {
        const filePath = path.join(process.cwd(), '..', 'Tally', 'SALE REPORT_JULY_.xls');
        if (fs.existsSync(filePath)) {
          fileBuffer = fs.readFileSync(filePath);
          fileName = 'SALE REPORT_JULY_.xls';
        } else {
          return NextResponse.json({ error: 'File Tally/SALE REPORT_JULY_.xls not found in project workspace' }, { status: 404 });
        }
      }
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

    // Find Header Row (row containing 'Vch No' or 'Party Name' or 'Order No')
    let headerRowIndex = rawRows.findIndex(row =>
      Array.isArray(row) && row.some(cell => cell && String(cell).toLowerCase().includes('vch no'))
    );

    if (headerRowIndex === -1) {
      headerRowIndex = rawRows.findIndex(row =>
        Array.isArray(row) && row.some(cell => cell && String(cell).toLowerCase().includes('party name'))
      );
    }

    if (headerRowIndex === -1) {
      headerRowIndex = 0;
    }

    const headers = rawRows[headerRowIndex].map(h => String(h || '').trim().toLowerCase());

    const getColIndex = (keywords: string[]) => {
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const vchNoIdx = getColIndex(['vch no', 'vch. no', 'voucher', 'invoice']);
    const dateIdx = getColIndex(['date']);
    const orderNoIdx = getColIndex(['order no', 'po', 'order']);
    const orderDateIdx = getColIndex(['order dt', 'order date']);
    const partyNameIdx = getColIndex(['party name', 'customer', 'party']);
    const itemNameIdx = getColIndex(['item name', 'stock item', 'product', 'description']);
    const qtyIdx = getColIndex(['quantity', 'qty']);
    const rateIdx = getColIndex(['rate', 'price']);
    const amountIdx = getColIndex(['amount', 'total']);
    const stockGroupIdx = getColIndex(['stock group', 'brand', 'group']);

    const dataRows = rawRows.slice(headerRowIndex + 1);

    // Group items by Invoice Number (Vch No)
    const invoicesMap = new Map<string, {
      invoiceNumber: string;
      invoiceDate: Date;
      poNumber: string;
      customerName: string;
      brand: string;
      items: Array<{
        itemName: string;
        quantity: number;
        rate: number;
        amount: number;
        stockGroup: string;
      }>;
    }>();

    const uniqueDatesSet = new Set<string>();

    dataRows.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length === 0) return;

      const vchNo = vchNoIdx !== -1 && row[vchNoIdx] ? String(row[vchNoIdx]).trim() : '';
      if (!vchNo || vchNo.toLowerCase().includes('total')) return;

      const rawDate = dateIdx !== -1 ? row[dateIdx] : null;
      const invoiceDate = parseExcelDate(rawDate);
      const dateIsoStr = invoiceDate.toISOString().split('T')[0];
      uniqueDatesSet.add(dateIsoStr);

      let orderNo = orderNoIdx !== -1 && row[orderNoIdx] ? String(row[orderNoIdx]).trim() : '';
      // Clean order number e.g. PO#GGNPO370787 -> GGNPO370787
      orderNo = orderNo.replace(/^po\s*#?\s*/i, '').trim();

      const customerName = partyNameIdx !== -1 && row[partyNameIdx] ? String(row[partyNameIdx]).trim() : 'UNKNOWN';
      const itemName = itemNameIdx !== -1 && row[itemNameIdx] ? String(row[itemNameIdx]).trim() : 'Item';
      const quantity = qtyIdx !== -1 && row[qtyIdx] ? parseFloat(String(row[qtyIdx])) || 0 : 0;
      const rate = rateIdx !== -1 && row[rateIdx] ? parseFloat(String(row[rateIdx])) || 0 : 0;
      const amount = amountIdx !== -1 && row[amountIdx] ? parseFloat(String(row[amountIdx])) || 0 : (quantity * rate);
      const stockGroup = stockGroupIdx !== -1 && row[stockGroupIdx] ? String(row[stockGroupIdx]).trim() : '';

      if (!invoicesMap.has(vchNo)) {
        invoicesMap.set(vchNo, {
          invoiceNumber: vchNo,
          invoiceDate,
          poNumber: orderNo,
          customerName,
          brand: stockGroup,
          items: []
        });
      }

      const invRecord = invoicesMap.get(vchNo)!;
      invRecord.items.push({
        itemName,
        quantity,
        rate,
        amount,
        stockGroup
      });
      if (orderNo && !invRecord.poNumber) {
        invRecord.poNumber = orderNo;
      }
    });

    const parsedInvoices = Array.from(invoicesMap.values());
    if (parsedInvoices.length === 0) {
      return NextResponse.json({ error: 'No valid sales invoice records found in uploaded file' }, { status: 400 });
    }

    // Process & Upsert PurchaseBills in MongoDB via Prisma
    let createdCount = 0;
    let updatedCount = 0;
    let totalBilledAmount = 0;

    for (const inv of parsedInvoices) {
      const invTotal = inv.items.reduce((sum, item) => sum + item.amount, 0);
      totalBilledAmount += invTotal;

      const existingBill = await prisma.purchaseBill.findFirst({
        where: { invoiceNumber: inv.invoiceNumber }
      });

      if (existingBill) {
        // Delete old items and update bill
        await prisma.purchaseBillItem.deleteMany({
          where: { billId: existingBill.id }
        });

        await prisma.purchaseBill.update({
          where: { id: existingBill.id },
          data: {
            invoiceDate: inv.invoiceDate,
            supplierName: inv.customerName,
            totalAmount: invTotal,
            notes: `PO:${inv.poNumber} | Party:${inv.customerName}`,
            status: 'VERIFIED',
            fileName,
            items: {
              create: inv.items.map(item => ({
                itemName: item.itemName,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                tallyItemName: item.itemName,
                unit: 'PCS'
              }))
            }
          }
        });
        updatedCount++;
      } else {
        // Create new bill
        await prisma.purchaseBill.create({
          data: {
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            supplierName: inv.customerName,
            totalAmount: invTotal,
            notes: `PO:${inv.poNumber} | Party:${inv.customerName}`,
            status: 'VERIFIED',
            fileName,
            items: {
              create: inv.items.map(item => ({
                itemName: item.itemName,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                tallyItemName: item.itemName,
                unit: 'PCS'
              }))
            }
          }
        });
        createdCount++;
      }
    }

    const uniqueDatesList = Array.from(uniqueDatesSet).sort();

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${fileName}: ${parsedInvoices.length} Invoices reconciled across ${uniqueDatesList.length} dates.`,
      fileName,
      totalInvoicesProcessed: parsedInvoices.length,
      createdCount,
      updatedCount,
      totalBilledAmount,
      uniqueDatesUploaded: uniqueDatesList
    });

  } catch (err: any) {
    console.error('❌ [DAILY REPORT UPLOAD ERROR]', err);
    return NextResponse.json({ error: 'Failed to upload & reconcile daily report: ' + err.message }, { status: 500 });
  }
}
