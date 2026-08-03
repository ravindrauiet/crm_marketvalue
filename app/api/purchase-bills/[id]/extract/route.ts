import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import * as XLSX from 'xlsx';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

function cleanVal(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseSpreadsheetBill(buf: Buffer) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  if (!rawData || rawData.length === 0) return null;

  let supplierName = '';
  let invoiceNumber = '';
  let invoiceDate = '';

  // 1. Scan top 20 rows for metadata
  for (let r = 0; r < Math.min(rawData.length, 20); r++) {
    const row = rawData[r];
    if (!row || !Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cellStr = cleanVal(row[c]);
      if (!cellStr) continue;

      if (!supplierName) {
        const m = cellStr.match(/(?:Supplier|Vendor|Billed\s*By|From)\s*[:=\s]\s*([A-Za-z0-9\s\.\-_&,]{3,50})/i);
        if (m && m[1]) supplierName = m[1].trim();
      }

      if (!invoiceNumber) {
        const m = cellStr.match(/(?:Invoice\s*(?:No|Num|#)?|Bill\s*(?:No|Num|#)?|Inv\s*No)\s*[:=\s#-]+([A-Za-z0-9\/\-_]{3,30})/i);
        if (m && m[1]) invoiceNumber = m[1].trim();
      }

      if (!invoiceDate) {
        const m = cellStr.match(/(?:Date|Invoice\s*Date|Bill\s*Date)\s*[:=\s]*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/i);
        if (m && m[1]) invoiceDate = m[1].trim();
      }
    }
  }

  // 2. Find header row
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  const kwScore = (str: string) => {
    const s = str.toLowerCase();
    let score = 0;
    if (/item|product|description|particulars/i.test(s)) score += 3;
    if (/qty|quantity|units/i.test(s)) score += 3;
    if (/rate|price|cost|amount/i.test(s)) score += 2;
    if (/hsn/i.test(s)) score += 2;
    return score;
  };

  let maxScore = 0;
  for (let i = 0; i < Math.min(rawData.length, 25); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    let totalScore = 0;
    row.forEach(cell => { if (cell) totalScore += kwScore(String(cell)); });
    if (totalScore >= 4 && totalScore > maxScore) {
      maxScore = totalScore;
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;

  const headerRow = rawData[headerRowIdx] || [];
  headerRow.forEach((cell: any, idx: number) => {
    if (cell !== null && cell !== undefined) {
      const key = String(cell).trim().toLowerCase();
      if (key) colMap[key] = idx;
    }
  });

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

  const nameIdx = getIdx('item name', 'product name', 'description', 'particulars', 'item');
  const hsnIdx = getIdx('hsn code', 'hsn');
  const qtyIdx = getIdx('quantity', 'qty', 'units');
  const unitIdx = getIdx('unit', 'uom');
  const rateIdx = getIdx('rate', 'price', 'unit price');
  const amountIdx = getIdx('total amount', 'amount', 'value');
  const taxRateIdx = getIdx('tax rate (%)', 'tax rate', 'gst %');
  const taxAmountIdx = getIdx('tax amount', 'gst amount', 'igst', 'cgst');
  const suppIdx = getIdx('supplier name', 'supplier', 'vendor');
  const invIdx = getIdx('invoice number', 'invoice no', 'bill no');
  const dateIdx = getIdx('invoice date', 'bill date', 'date');

  const items: any[] = [];
  let totalAmount = 0;
  let taxAmount = 0;

  for (let r = headerRowIdx + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rowStr = row.map(cleanVal).join(' ').toLowerCase();
    if (rowStr.includes('total') || rowStr.includes('subtotal') || rowStr.includes('grand total')) continue;

    const rawName = nameIdx >= 0 ? cleanVal(row[nameIdx]) : '';
    if (!rawName) continue;

    if (!supplierName && suppIdx >= 0) supplierName = cleanVal(row[suppIdx]);
    if (!invoiceNumber && invIdx >= 0) invoiceNumber = cleanVal(row[invIdx]);
    if (!invoiceDate && dateIdx >= 0) invoiceDate = cleanVal(row[dateIdx]);

    const rawQty = qtyIdx >= 0 ? cleanVal(row[qtyIdx]) : '0';
    const rawRate = rateIdx >= 0 ? cleanVal(row[rateIdx]) : '0';
    const rawAmt = amountIdx >= 0 ? cleanVal(row[amountIdx]) : '0';
    const rawTaxRate = taxRateIdx >= 0 ? cleanVal(row[taxRateIdx]) : '0';
    const rawTaxAmt = taxAmountIdx >= 0 ? cleanVal(row[taxAmountIdx]) : '0';

    const quantity = parseFloat(rawQty.replace(/[^0-9.]/g, '')) || 0;
    const rate = parseFloat(rawRate.replace(/[^0-9.]/g, '')) || 0;
    const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || (quantity * rate);
    const taxRateVal = parseFloat(rawTaxRate.replace(/[^0-9.]/g, '')) || 0;
    const itemTaxAmount = parseFloat(rawTaxAmt.replace(/[^0-9.]/g, '')) || (amount * (taxRateVal > 1 ? taxRateVal / 100 : taxRateVal));

    totalAmount += (amount + itemTaxAmount);
    taxAmount += itemTaxAmount;

    items.push({
      itemName: rawName,
      hsnCode: hsnIdx >= 0 ? cleanVal(row[hsnIdx]) : undefined,
      quantity,
      unit: unitIdx >= 0 ? cleanVal(row[unitIdx]) : 'PCS',
      rate,
      amount,
      taxRate: taxRateVal > 1 ? taxRateVal / 100 : taxRateVal,
      taxAmount: itemTaxAmount
    });
  }

  return {
    supplierName: supplierName || 'GLOMIN OVERSEAS',
    invoiceNumber: invoiceNumber || undefined,
    invoiceDate: invoiceDate || undefined,
    totalAmount: Number(totalAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    items
  };
}

function localExtractPurchaseBill(text: string, fileName: string) {
  let supplierName = '';
  let invoiceNumber = '';
  let invoiceDate = '';
  let totalAmount = 0;
  let taxAmount = 0;

  // 1. Supplier Name
  const supplierMatch = text.match(/(?:Supplier|Vendor|Billed\s*By|Company)\s*[:=\s]\s*([A-Za-z0-9\s\.\-_&,]{3,50})/i);
  if (supplierMatch && supplierMatch[1]) {
    supplierName = supplierMatch[1].split('\n')[0].trim();
  } else {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    for (const l of lines.slice(0, 5)) {
      if (l.length > 3 && l.length < 50 && !/invoice|bill|tax|date|total/i.test(l)) {
        supplierName = l;
        break;
      }
    }
  }

  // 2. Invoice Number
  const invMatch = text.match(/(?:Invoice\s*(?:No|Num|#)?|Bill\s*(?:No|Num|#)?|Inv\s*No)\s*[:=\s#-]+([A-Za-z0-9\/\-_]{3,30})/i);
  if (invMatch && invMatch[1]) {
    invoiceNumber = invMatch[1].trim();
  } else {
    const patternMatch = text.match(/([A-Z0-9]{2,8}[\/-][A-Z0-9\/-]{3,20})/);
    if (patternMatch) invoiceNumber = patternMatch[1].trim();
  }

  // 3. Invoice Date
  const dateMatch = text.match(/(?:Date|Invoice\s*Date|Bill\s*Date)\s*[:=\s]*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/i);
  if (dateMatch && dateMatch[1]) {
    invoiceDate = dateMatch[1].trim();
  }

  // 4. Amounts
  const totalMatch = text.match(/(?:Total\s*Amount|Grand\s*Total|Net\s*Amount|Total)\s*[:=\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (totalMatch && totalMatch[1]) {
    totalAmount = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
  }

  const taxMatch = text.match(/(?:Tax\s*Amount|Total\s*GST|IGST|CGST|SGST|Tax)\s*[:=\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (taxMatch && taxMatch[1]) {
    taxAmount = parseFloat(taxMatch[1].replace(/,/g, '')) || 0;
  }

  return {
    supplierName: supplierName || fileName.replace(/\.[^/.]+$/, ''),
    invoiceNumber: invoiceNumber || undefined,
    invoiceDate: invoiceDate || undefined,
    totalAmount,
    taxAmount,
    items: []
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const bill = await prisma.purchaseBill.findUnique({ where: { id: params.id } });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    if (!bill.filePath) return NextResponse.json({ error: 'No file attached' }, { status: 400 });

    await prisma.purchaseBill.update({ where: { id: params.id }, data: { status: 'PROCESSING', errorMessage: null } });

    let buf: Buffer;
    if (bill.filePath.startsWith('data:')) {
      const base64Data = bill.filePath.split(',')[1];
      buf = Buffer.from(base64Data, 'base64');
    } else {
      const absolutePath = path.join(process.cwd(), 'public', bill.filePath || '');
      buf = readFileSync(absolutePath);
    }

    const fileNameLower = (bill.fileName || '').toLowerCase();
    const mimeTypeLower = (bill.mimeType || '').toLowerCase();

    let extracted: any = null;

    // A. Check if Excel / CSV file -> Deterministic parsing (Bypasses OpenAI)
    if (mimeTypeLower.includes('excel') || mimeTypeLower.includes('spreadsheet') || mimeTypeLower.includes('csv') || fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls') || fileNameLower.endsWith('.csv')) {
      console.log(`📊 [PURCHASE BILL EXTRACT] Deterministic Excel/CSV extraction for ${bill.fileName}...`);
      extracted = parseSpreadsheetBill(buf);
    }

    // B. PDF / Image / Text file -> Try AI first, fall back to local parser on failure/429
    if (!extracted) {
      let documentText = '';
      if (mimeTypeLower.includes('pdf')) {
        try {
          const pdfData = await pdf(buf);
          documentText = pdfData.text || '';
        } catch {}
      }

      if (!documentText && mimeTypeLower.startsWith('image/')) {
        try {
          const base64Image = buf.toString('base64');
          const visionResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${bill.mimeType};base64,${base64Image}` } },
                { type: 'text', text: 'Extract ALL text from this purchase bill / invoice image.' }
              ]
            }],
            max_tokens: 4000,
          });
          documentText = visionResponse.choices[0]?.message?.content || '';
        } catch {}
      }

      if (!documentText) {
        documentText = buf.toString('utf-8');
      }

      // Try OpenAI JSON extraction
      if (process.env.OPENAI_API_KEY) {
        try {
          console.log(`🤖 [PURCHASE BILL EXTRACT] Running AI extraction for ${bill.fileName}...`);
          const prompt = `Extract purchase bill info as JSON:
{
  "supplierName": "name",
  "invoiceNumber": "number",
  "invoiceDate": "YYYY-MM-DD",
  "totalAmount": number,
  "taxAmount": number,
  "items": [{"itemName": "name", "hsnCode": "code", "quantity": 10, "unit": "PCS", "rate": 50, "amount": 500, "taxRate": 0.05, "taxAmount": 25}]
}
Text: ${documentText.substring(0, 8000)}`;

          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Extract structured data from purchase bill. Return valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          });
          extracted = JSON.parse(completion.choices[0]?.message?.content || '{}');
        } catch (aiErr: any) {
          console.warn(`⚠️ [PURCHASE BILL EXTRACT] AI extraction failed (${aiErr.message}). Using local fallback parser...`);
        }
      }

      // Local fallback parser if AI failed or quota exceeded
      if (!extracted || !extracted.supplierName) {
        extracted = localExtractPurchaseBill(documentText, bill.fileName || 'Bill');
      }
    }

    if (!extracted) {
      extracted = { supplierName: bill.fileName || 'Bill', items: [] };
    }

    // Check duplicate
    let isDuplicate = false;
    let duplicateOf = null;
    if (extracted.invoiceNumber) {
      const existing = await prisma.purchaseBill.findFirst({
        where: {
          invoiceNumber: extracted.invoiceNumber,
          id: { not: params.id },
          status: { not: 'FAILED' }
        }
      });
      if (existing) {
        isDuplicate = true;
        duplicateOf = extracted.invoiceNumber;
      }
    }

    const updatedBill = await prisma.purchaseBill.update({
      where: { id: params.id },
      data: {
        supplierName: extracted.supplierName || null,
        invoiceNumber: extracted.invoiceNumber || null,
        invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : null,
        totalAmount: extracted.totalAmount || 0,
        taxAmount: extracted.taxAmount || 0,
        rawExtractedData: JSON.stringify(extracted),
        status: isDuplicate ? 'DUPLICATE' : 'EXTRACTED',
        duplicateOf: duplicateOf,
        errorMessage: null, // Clear any quota/read errors
        items: {
          deleteMany: {},
          create: (extracted.items || []).map((item: any) => ({
            itemName: item.itemName || '',
            hsnCode: item.hsnCode || null,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || null,
            rate: parseFloat(item.rate) || 0,
            amount: parseFloat(item.amount) || 0,
            taxRate: parseFloat(item.taxRate) || 0,
            taxAmount: parseFloat(item.taxAmount) || 0,
          }))
        }
      },
      include: { items: true }
    });

    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    console.error('❌ [PURCHASE BILL EXTRACT ERROR]', err);
    await prisma.purchaseBill.update({
      where: { id: params.id },
      data: { status: 'FAILED', errorMessage: err.message }
    }).catch(() => {});
    return NextResponse.json({ error: 'Extraction failed: ' + err.message }, { status: 500 });
  }
}
