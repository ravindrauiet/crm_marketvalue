import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';

function cleanVal(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function extractPoAndInvoice(text: string) {
  let poNumber = '';
  let invoiceNumber = '';

  if (!text) return { poNumber, invoiceNumber };

  // Extract PO Number (e.g. PO-2024-001, IRA27601427, 8Q4RMHAU, FSMWG06739499)
  const poMatch = text.match(/(?:PO\s*(?:Number|No|#)?|Purchase\s*Order\s*(?:Number|No|#)?)\s*[:=\s#-]*([A-Za-z0-9\-_]{5,30})/i);
  if (poMatch && poMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'ORDER', 'EXPIRED'].includes(poMatch[1].toUpperCase())) {
    poNumber = poMatch[1].trim();
  }

  // Extract Invoice Number (e.g. INV-1002, FK-9948, 2025/0814, K00681/26-27)
  const invMatch = text.match(/(?:INV\b|Invoice\b|Bill\b|Inv\s*No\b|Invoice\s*No\b)\s*[:=\s#-]*([A-Za-z0-9\/\-_]{4,30})/i);
  if (invMatch && invMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'BILL'].includes(invMatch[1].toUpperCase())) {
    invoiceNumber = invMatch[1].trim();
  }

  return { poNumber, invoiceNumber };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const statementType = String(formData.get('statementType') || 'bank').toLowerCase(); // 'vendor' | 'tally' | 'bank'

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileNameLower = file.name.toLowerCase();
    const mimeTypeLower = (file.type || '').toLowerCase();

    let normalizedRows: any[] = [];

    // A. Check if PDF -> Parse text
    if (mimeTypeLower.includes('pdf') || fileNameLower.endsWith('.pdf')) {
      try {
        const pdfData = await pdf(buffer);
        const text = pdfData.text || '';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        for (const line of lines) {
          const dateMatch = line.match(/([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/);
          const numbers = line.match(/([0-9,]+\.[0-9]{2})/g) || [];

          if (dateMatch && numbers.length > 0 && numbers[0]) {
            const creditAmount = parseFloat(numbers[0].replace(/,/g, '')) || 0;
            const balance = numbers.length > 1 ? parseFloat(numbers[1].replace(/,/g, '')) : 0;
            const { poNumber, invoiceNumber } = extractPoAndInvoice(line);

            normalizedRows.push({
              dateRaw: dateMatch[1],
              narration: line,
              debitAmount: 0,
              creditAmount,
              balance,
              poNumber,
              invoiceNumber,
              bankRef: '',
            });
          }
        }
      } catch (pdfErr: any) {
        console.warn('PDF Parse warning:', pdfErr.message);
      }
    }

    // B. Check if Excel / CSV
    if (normalizedRows.length === 0) {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

      if (rawData.length > 0) {
        let headerRowIdx = -1;
        let colMap: Record<string, number> = {};

        const kwScore = (str: string) => {
          const s = str.toLowerCase();
          let score = 0;
          if (/date|posting|value/i.test(s)) score += 3;
          if (/narration|particulars|description|remarks|vch/i.test(s)) score += 3;
          if (/debit|dr|withdrawal/i.test(s)) score += 3;
          if (/credit|cr|deposit/i.test(s)) score += 3;
          if (/balance/i.test(s)) score += 2;
          if (/po|order/i.test(s)) score += 2;
          if (/invoice|bill/i.test(s)) score += 2;
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

        const dateIdx = getIdx('date', 'txn date', 'posting date', 'value date');
        const narrIdx = getIdx('narration', 'particulars', 'description', 'remarks', 'details', 'vch no');
        const debitIdx = getIdx('debit', 'dr', 'withdrawal');
        const creditIdx = getIdx('credit', 'cr', 'deposit');
        const balIdx = getIdx('balance', 'closing balance');
        const refIdx = getIdx('ref', 'cheque', 'reference', 'txn ref');
        const poColIdx = getIdx('po number', 'po no', 'po #', 'order no', 'po');
        const invColIdx = getIdx('invoice number', 'invoice no', 'inv no', 'bill no', 'invoice');

        for (let r = headerRowIdx + 1; r < rawData.length; r++) {
          const row = rawData[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const dateRaw = dateIdx >= 0 ? row[dateIdx] : '';
          const narration = narrIdx >= 0 ? cleanVal(row[narrIdx]) : row.map(cleanVal).join(' ');
          const debitStr = debitIdx >= 0 ? cleanVal(row[debitIdx]) : '0';
          const creditStr = creditIdx >= 0 ? cleanVal(row[creditIdx]) : '0';
          const balStr = balIdx >= 0 ? cleanVal(row[balIdx]) : '0';
          const bankRef = refIdx >= 0 ? cleanVal(row[refIdx]) : '';

          const debitAmount = parseFloat(debitStr.replace(/[^0-9.]/g, '')) || 0;
          const creditAmount = parseFloat(creditStr.replace(/[^0-9.]/g, '')) || 0;
          const balance = parseFloat(balStr.replace(/[^0-9.]/g, '')) || 0;

          if (debitAmount === 0 && creditAmount === 0 && !narration) continue;

          let colPo = poColIdx >= 0 ? cleanVal(row[poColIdx]) : '';
          let colInv = invColIdx >= 0 ? cleanVal(row[invColIdx]) : '';

          const textExtracted = extractPoAndInvoice(narration);
          const poNumber = colPo || textExtracted.poNumber;
          const invoiceNumber = colInv || textExtracted.invoiceNumber;

          normalizedRows.push({
            dateRaw,
            narration,
            debitAmount,
            creditAmount,
            balance,
            bankRef,
            poNumber,
            invoiceNumber,
          });
        }
      }
    }

    if (normalizedRows.length === 0) {
      return NextResponse.json({ error: 'No valid statement rows found in file' }, { status: 400 });
    }

    // Fetch database records for matching & set-off
    const [invoices, chainPOs, purchaseBills, existingRecos] = await Promise.all([
      prisma.invoice.findMany({ select: { invoiceNumber: true, totalAmount: true, status: true } }),
      prisma.chainPurchaseOrder.findMany({ select: { poNumber: true, totalAmount: true, chainName: true } }),
      prisma.purchaseBill.findMany({ select: { invoiceNumber: true, totalAmount: true, supplierName: true } }),
      prisma.paymentReco.findMany({ where: { matchStatus: { in: ['UNMATCHED', 'PARTIAL'] } } }),
    ]);

    // Matching & Set-off logic
    const autoMatch = (row: any) => {
      const narr = row.narration.toLowerCase();
      const amt = row.creditAmount > 0 ? row.creditAmount : row.debitAmount;
      const poNum = row.poNumber ? row.poNumber.toLowerCase() : '';
      const invNum = row.invoiceNumber ? row.invoiceNumber.toLowerCase() : '';

      // 1. Match by PO Number
      if (poNum || narr) {
        const po = chainPOs.find(p => (poNum && p.poNumber.toLowerCase() === poNum) || (p.poNumber && narr.includes(p.poNumber.toLowerCase())));
        if (po) {
          const diff = Math.abs(amt - po.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedPoNumber: po.poNumber,
            matchedAmount: Math.min(amt, po.totalAmount),
            pendingAmount: Math.max(0, po.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: po.chainName,
          };
        }
      }

      // 2. Match by Invoice Number
      if (invNum || narr) {
        const inv = invoices.find(i => (invNum && i.invoiceNumber.toLowerCase() === invNum) || (i.invoiceNumber && narr.includes(i.invoiceNumber.toLowerCase())));
        if (inv) {
          const diff = Math.abs(amt - inv.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedInvoiceNo: inv.invoiceNumber,
            matchedAmount: Math.min(amt, inv.totalAmount),
            pendingAmount: Math.max(0, inv.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
          };
        }

        const bill = purchaseBills.find(b => (invNum && b.invoiceNumber?.toLowerCase() === invNum) || (b.invoiceNumber && narr.includes(b.invoiceNumber.toLowerCase())));
        if (bill) {
          const diff = Math.abs(amt - bill.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedInvoiceNo: bill.invoiceNumber || undefined,
            matchedAmount: Math.min(amt, bill.totalAmount),
            pendingAmount: Math.max(0, bill.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: bill.supplierName || undefined,
          };
        }
      }

      // 3. Cross set-off with existing Tally/VendorReco rows in DB
      if (poNum || invNum) {
        const reco = existingRecos.find(r => 
          (poNum && r.matchedPoNumber?.toLowerCase() === poNum) ||
          (invNum && r.matchedInvoiceNo?.toLowerCase() === invNum) ||
          (poNum && r.narration?.toLowerCase().includes(poNum)) ||
          (invNum && r.narration?.toLowerCase().includes(invNum))
        );
        if (reco) {
          const recoAmt = reco.creditAmount > 0 ? reco.creditAmount : reco.debitAmount;
          const diff = Math.abs(amt - recoAmt);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedPoNumber: reco.matchedPoNumber || (poNum ? poNum.toUpperCase() : undefined),
            matchedInvoiceNo: reco.matchedInvoiceNo || (invNum ? invNum.toUpperCase() : undefined),
            matchedAmount: Math.min(amt, recoAmt),
            pendingAmount: Math.max(0, Math.abs(amt - recoAmt)),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: reco.chainName || undefined,
          };
        }
      }

      // 4. Fallback chain identification
      const chainKeywords = [
        { key: 'flipkart', chain: 'FLIPKART' },
        { key: 'amazon', chain: 'AMAZON' },
        { key: 'zepto', chain: 'ZEPTO' },
        { key: 'blinkit', chain: 'BLINKIT' },
        { key: 'swiggy', chain: 'SWIGGY' },
        { key: 'bigbasket', chain: 'BIGBASKET' },
        { key: 'dmart', chain: 'DMART' },
      ];
      for (const ck of chainKeywords) {
        if (narr.includes(ck.key)) {
          return { matchStatus: 'UNMATCHED', chainName: ck.chain, pendingAmount: amt };
        }
      }

      return { matchStatus: 'UNMATCHED', pendingAmount: amt };
    };

    // Create RecoBatch record
    const batch = await prisma.recoBatch.create({
      data: {
        fileName: file.name,
        rowCount: normalizedRows.length,
        totalCredit: normalizedRows.reduce((s, r) => s + r.creditAmount, 0),
        totalDebit: normalizedRows.reduce((s, r) => s + r.debitAmount, 0),
        notes: `Type: ${statementType.toUpperCase()}`
      }
    });

    const recoRows = normalizedRows.map(row => {
      const match = autoMatch(row);
      let txnDate: Date | null = null;
      if (row.dateRaw) {
        txnDate = row.dateRaw instanceof Date ? row.dateRaw : new Date(row.dateRaw);
        if (txnDate && isNaN(txnDate.getTime())) txnDate = null;
      }

      return {
        batchId: batch.id,
        txnDate,
        narration: row.narration,
        debitAmount: row.debitAmount,
        creditAmount: row.creditAmount,
        balance: row.balance,
        bankRef: row.bankRef,
        matchStatus: match.matchStatus || 'UNMATCHED',
        matchedInvoiceNo: match.matchedInvoiceNo || (row.invoiceNumber ? row.invoiceNumber.toUpperCase() : null),
        matchedPoNumber: match.matchedPoNumber || (row.poNumber ? row.poNumber.toUpperCase() : null),
        matchedAmount: match.matchedAmount || 0,
        pendingAmount: match.pendingAmount || (row.creditAmount > 0 ? row.creditAmount : row.debitAmount),
        deductionAmount: match.deductionAmount || 0,
        chainName: match.chainName || null,
        notes: `Source: ${statementType.toUpperCase()}`
      };
    });

    await prisma.paymentReco.createMany({ data: recoRows });

    const matchedCount = recoRows.filter(r => r.matchStatus === 'MATCHED').length;
    const partialCount = recoRows.filter(r => r.matchStatus === 'PARTIAL').length;

    await prisma.recoBatch.update({
      where: { id: batch.id },
      data: { matchedCount: matchedCount + partialCount, unmatchedCount: recoRows.length - matchedCount - partialCount }
    });

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      total: recoRows.length,
      matched: matchedCount,
      partial: partialCount,
      unmatched: recoRows.length - matchedCount - partialCount,
    });

  } catch (err: any) {
    console.error('❌ [RECO UPLOAD ERROR]', err);
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 });
  }
}
