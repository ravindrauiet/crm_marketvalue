import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadToImageKit } from '@/lib/imagekit';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { extractRecoWithAI } from '@/lib/ai';
import { unlinkSync } from 'fs';
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

  // Extract PO Number (e.g. PO-2024-001, IRA27601427, 8Q4RMHAU, FSMWG06739499, TRAD10818891)
  const poMatch = text.match(/(?:PO\s*(?:Number|No|#)?|Purchase\s*Order\s*(?:Number|No|#)?)\s*[:=\s#-]*([A-Za-z0-9\-_]{5,30})/i);
  if (poMatch && poMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'ORDER', 'EXPIRED'].includes(poMatch[1].toUpperCase())) {
    poNumber = poMatch[1].trim();
  }

  // Extract Invoice Number (e.g. INV-1002, FK-9948, 2025/0814, K00681/26-27, GO/2627/2604, SPAR/2627/360)
  const invMatch = text.match(/(?:INV\b|Invoice\b|Bill\b|Inv\s*No\b|Invoice\s*No\b|Ref\s*Doc\.?\s*No\.?)\s*[:=\s#-]*([A-Za-z0-9\/\-_]{4,30})/i);
  if (invMatch && invMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'BILL'].includes(invMatch[1].toUpperCase())) {
    invoiceNumber = invMatch[1].trim();
  }

  return { poNumber, invoiceNumber };
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`\n==================================================`);
  console.log(`💰 [RECO UPLOAD API] Incoming Reconciliation File Upload at ${timestamp}`);

  let filepath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const statementType = String(formData.get('statementType') || 'bank').toLowerCase(); // 'vendor' | 'tally' | 'bank'
    const chainNameHint = String(formData.get('chainName') || 'OTHER').toUpperCase().trim();

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    console.log(`ℹ️ [RECO UPLOAD API] File Name: "${file.name}" | Size: ${(file.size / 1024).toFixed(2)} KB | Type: "${statementType}" | Chain Hint: "${chainNameHint}"`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileNameLower = file.name.toLowerCase();
    const mimeTypeLower = (file.type || 'application/octet-stream').toLowerCase();

    // Save temporary file for AI / parser engines
    const stored = await saveBufferToUploads(file.name, buffer);
    filepath = stored.filepath;

    // Upload statement file to ImageKit.io CDN
    const ikRes = await uploadToImageKit(buffer, file.name, '/reconciliation');

    let normalizedRows: any[] = [];
    let aiSummary: any = { chainName: chainNameHint !== 'OTHER' ? chainNameHint : 'OTHER', totalAmount: 0 };

    // 1. Try AI Extraction for PDF, DOC, Images, and complex Payment Advices
    try {
      console.log(`🤖 [RECO UPLOAD API] Running AI Extraction for Reconciliation Statement...`);
      const aiResult = await extractRecoWithAI(filepath, mimeTypeLower, statementType, chainNameHint);
      if (aiResult && aiResult.records && aiResult.records.length > 0) {
        aiSummary = aiResult.summary || {};
        console.log(`✅ [RECO UPLOAD API] AI Extracted ${aiResult.records.length} records. Chain: "${aiSummary.chainName}"`);
        normalizedRows = aiResult.records.map(r => ({
          dateRaw: r.txnDate || '',
          narration: r.narration || r.deductionReason || (r.invoiceNumber ? `Invoice ${r.invoiceNumber}` : 'Payment Advice Item'),
          debitAmount: r.debitAmount || 0,
          creditAmount: r.creditAmount || (r.netAmount && r.netAmount > 0 ? r.netAmount : 0),
          tdsAmount: r.tdsAmount || 0,
          netAmount: r.netAmount || 0,
          balance: r.balance || 0,
          bankRef: r.bankRef || aiSummary.paymentRefNo || '',
          poNumber: r.poNumber || '',
          invoiceNumber: r.invoiceNumber || r.refDocNo || '',
          docNo: r.docNo || '',
          deductionReason: r.deductionReason || '',
        }));
      }
    } catch (aiErr: any) {
      console.warn(`⚠️ [RECO UPLOAD API] AI Extraction notice:`, aiErr.message);
    }

    // 2. Fallback: Parse PDF using regex text splitting if AI returned no records
    if (normalizedRows.length === 0 && (mimeTypeLower.includes('pdf') || fileNameLower.endsWith('.pdf'))) {
      try {
        console.log(`📄 [RECO UPLOAD API] Fallback PDF text parsing...`);
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

    // 3. Fallback: Check if Excel / CSV table
    if (normalizedRows.length === 0) {
      try {
        console.log(`📊 [RECO UPLOAD API] Fallback Excel/CSV parsing...`);
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

          const dateIdx = getIdx('date', 'txn date', 'posting date', 'value date', 'inv date');
          const narrIdx = getIdx('narration', 'particulars', 'description', 'remarks', 'details', 'vch no', 'doc type');
          const debitIdx = getIdx('debit', 'dr', 'withdrawal', 'deduction', 'tds');
          const creditIdx = getIdx('credit', 'cr', 'deposit', 'invoice amt', 'total amount', 'base value');
          const balIdx = getIdx('balance', 'closing balance', 'net payable', 'payment amount');
          const refIdx = getIdx('ref', 'cheque', 'reference', 'txn ref', 'utr', 'doc no');
          const poColIdx = getIdx('po number', 'po no', 'po #', 'order no', 'po');
          const invColIdx = getIdx('invoice number', 'invoice no', 'inv no', 'bill no', 'invoice', 'ref doc');

          for (let r = headerRowIdx + 1; r < rawData.length; r++) {
            const row = rawData[r];
            if (!row || !Array.isArray(row) || row.length === 0) continue;

            const dateRaw = dateIdx >= 0 ? row[dateIdx] : '';
            const narration = narrIdx >= 0 ? cleanVal(row[narrIdx]) : row.map(cleanVal).join(' ');
            const debitStr = debitIdx >= 0 ? cleanVal(row[debitIdx]) : '0';
            const creditStr = creditIdx >= 0 ? cleanVal(row[creditIdx]) : '0';
            const balStr = balIdx >= 0 ? cleanVal(row[balIdx]) : '0';
            const bankRef = refIdx >= 0 ? cleanVal(row[refIdx]) : '';

            const debitAmount = parseFloat(debitStr.replace(/[^0-9.-]/g, '')) || 0;
            const creditAmount = parseFloat(creditStr.replace(/[^0-9.-]/g, '')) || 0;
            const balance = parseFloat(balStr.replace(/[^0-9.-]/g, '')) || 0;

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
      } catch (excelErr: any) {
        console.warn('Excel parse warning:', excelErr.message);
      }
    }

    // Clean up temporary file
    if (filepath) {
      try { unlinkSync(filepath); } catch {}
    }

    if (normalizedRows.length === 0) {
      return NextResponse.json({ error: 'No valid statement/payment advice rows found in file' }, { status: 400 });
    }

    // Auto-detect Retail Chain / Bank from document text & AI summary
    const fullTextSample = (JSON.stringify(aiSummary) + ' ' + normalizedRows.map(r => `${r.narration} ${r.invoiceNumber} ${r.poNumber}`).join(' ')).toUpperCase();
    let detectedChain = aiSummary?.chainName || 'OTHER';

    if (detectedChain === 'OTHER') {
      if (fullTextSample.includes('RELIANCE')) detectedChain = 'RELIANCE';
      else if (fullTextSample.includes('AMAZON')) detectedChain = 'AMAZON';
      else if (fullTextSample.includes('BLINK COMMERCE') || fullTextSample.includes('BLINKIT')) detectedChain = 'BLINKIT';
      else if (fullTextSample.includes('ZEPTO')) detectedChain = 'ZEPTO';
      else if (fullTextSample.includes('HSBC')) detectedChain = 'HSBC';
      else if (fullTextSample.includes('SWIGGY') || fullTextSample.includes('SCOOTSY')) detectedChain = 'SWIGGY';
      else if (fullTextSample.includes('FLIPKART')) detectedChain = 'FLIPKART';
      else if (fullTextSample.includes('BIGBASKET') || fullTextSample.includes('INNOVATIVE RETAIL')) detectedChain = 'BIGBASKET';
      else if (fullTextSample.includes('DMART') || fullTextSample.includes('AVENUE SUPERMARTS')) detectedChain = 'DMART';
    }

    console.log(`ℹ️ [RECO UPLOAD API] Final Auto-Detected Chain: "${detectedChain}"`);

    // Fetch database records for matching & set-off
    const [invoices, chainPOs, purchaseBills, existingRecos] = await Promise.all([
      prisma.invoice.findMany({ select: { invoiceNumber: true, totalAmount: true, status: true } }),
      prisma.chainPurchaseOrder.findMany({ select: { poNumber: true, totalAmount: true, chainName: true } }),
      prisma.purchaseBill.findMany({ select: { invoiceNumber: true, totalAmount: true, supplierName: true } }),
      prisma.paymentReco.findMany({ where: { matchStatus: { in: ['UNMATCHED', 'PARTIAL'] } } }),
    ]);

    // Matching & Set-off logic
    const autoMatch = (row: any) => {
      const narr = String(row.narration || '').toLowerCase();
      const amt = row.creditAmount > 0 ? row.creditAmount : (row.netAmount && Math.abs(row.netAmount) > 0 ? Math.abs(row.netAmount) : Math.abs(row.debitAmount));
      const poNum = String(row.poNumber || '').trim().toLowerCase();
      const invNum = String(row.invoiceNumber || row.refDocNo || '').trim().toLowerCase();

      // 1. Match by PO Number
      if (poNum || narr) {
        const po = chainPOs.find(p => {
          if (!p.poNumber) return false;
          const pNo = p.poNumber.toLowerCase();
          return (poNum && pNo === poNum) || (pNo.length >= 3 && narr.includes(pNo));
        });
        if (po) {
          const diff = Math.abs(amt - po.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedPoNumber: po.poNumber,
            matchedAmount: Math.min(amt, po.totalAmount),
            pendingAmount: Math.max(0, po.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: po.chainName || detectedChain,
          };
        }
      }

      // 2. Match by Invoice Number
      if (invNum || narr) {
        const inv = invoices.find(i => {
          if (!i.invoiceNumber) return false;
          const iNo = i.invoiceNumber.toLowerCase();
          return (invNum && iNo === invNum) || (iNo.length >= 3 && narr.includes(iNo));
        });
        if (inv) {
          const diff = Math.abs(amt - inv.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedInvoiceNo: inv.invoiceNumber,
            matchedAmount: Math.min(amt, inv.totalAmount),
            pendingAmount: Math.max(0, inv.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: detectedChain !== 'OTHER' ? detectedChain : undefined,
          };
        }

        const bill = purchaseBills.find(b => {
          if (!b.invoiceNumber) return false;
          const bNo = b.invoiceNumber.toLowerCase();
          return (invNum && bNo === invNum) || (bNo.length >= 3 && narr.includes(bNo));
        });
        if (bill) {
          const diff = Math.abs(amt - bill.totalAmount);
          return {
            matchStatus: diff < 1 ? 'MATCHED' : 'PARTIAL',
            matchedInvoiceNo: bill.invoiceNumber || undefined,
            matchedAmount: Math.min(amt, bill.totalAmount),
            pendingAmount: Math.max(0, bill.totalAmount - amt),
            deductionAmount: diff >= 1 ? diff : 0,
            chainName: bill.supplierName || detectedChain,
          };
        }
      }

      // 3. Cross set-off with existing Tally/VendorReco rows in DB
      if (poNum || invNum || narr) {
        const reco = existingRecos.find(r => {
          const rPo = r.matchedPoNumber ? r.matchedPoNumber.toLowerCase() : '';
          const rInv = r.matchedInvoiceNo ? r.matchedInvoiceNo.toLowerCase() : '';
          const rNarr = r.narration ? r.narration.toLowerCase() : '';
          return (
            (poNum && rPo === poNum) ||
            (invNum && rInv === invNum) ||
            (poNum && poNum.length >= 3 && rNarr.includes(poNum)) ||
            (invNum && invNum.length >= 3 && rNarr.includes(invNum))
          );
        });
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
            chainName: reco.chainName || detectedChain,
          };
        }
      }

      return { matchStatus: 'UNMATCHED', pendingAmount: amt, chainName: detectedChain !== 'OTHER' ? detectedChain : undefined };
    };

    // Calculate total batch amounts
    const totalCredit = normalizedRows.reduce((s, r) => s + (r.creditAmount || (r.netAmount > 0 ? r.netAmount : 0)), 0);
    const totalDebit = normalizedRows.reduce((s, r) => s + (r.debitAmount || (r.netAmount < 0 ? Math.abs(r.netAmount) : 0)), 0);

    // Create RecoBatch record
    const batch = await prisma.recoBatch.create({
      data: {
        fileName: file.name,
        rowCount: normalizedRows.length,
        totalCredit: totalCredit || (aiSummary?.totalAmount || 0),
        totalDebit,
        imagekitUrl: ikRes?.url || null,
        notes: `Chain: ${detectedChain} | Type: ${statementType.toUpperCase()} ${aiSummary?.paymentRefNo ? '| Ref: ' + aiSummary.paymentRefNo : ''}`
      }
    });

    const recoRows = normalizedRows.map(row => {
      const match = autoMatch(row);
      let txnDate: Date | null = null;
      if (row.dateRaw) {
        txnDate = row.dateRaw instanceof Date ? row.dateRaw : new Date(row.dateRaw);
        if (txnDate && isNaN(txnDate.getTime())) txnDate = null;
      }

      const creditAmount = row.creditAmount || (row.netAmount && row.netAmount > 0 ? row.netAmount : 0);
      const debitAmount = row.debitAmount || (row.netAmount && row.netAmount < 0 ? Math.abs(row.netAmount) : 0);
      const pendingAmt = match.pendingAmount !== undefined ? match.pendingAmount : (creditAmount > 0 ? creditAmount : debitAmount);

      return {
        batchId: batch.id,
        txnDate,
        narration: row.narration || row.deductionReason || 'Payment Advice Row',
        debitAmount,
        creditAmount,
        balance: row.balance || 0,
        bankRef: row.bankRef || aiSummary?.paymentRefNo || null,
        matchStatus: match.matchStatus || 'UNMATCHED',
        matchedInvoiceNo: match.matchedInvoiceNo || (row.invoiceNumber ? row.invoiceNumber.toUpperCase() : null),
        matchedPoNumber: match.matchedPoNumber || (row.poNumber ? row.poNumber.toUpperCase() : null),
        matchedAmount: match.matchedAmount || 0,
        pendingAmount: pendingAmt,
        deductionAmount: row.tdsAmount || match.deductionAmount || 0,
        deductionReason: row.deductionReason || null,
        chainName: match.chainName || (detectedChain !== 'OTHER' ? detectedChain : null),
        notes: `Source: ${statementType.toUpperCase()}`
      };
    });

    await prisma.paymentReco.createMany({ data: recoRows });

    const matchedCount = recoRows.filter(r => r.matchStatus === 'MATCHED').length;
    const partialCount = recoRows.filter(r => r.matchStatus === 'PARTIAL').length;
    const unmatchedCount = recoRows.length - matchedCount - partialCount;

    await prisma.recoBatch.update({
      where: { id: batch.id },
      data: { matchedCount: matchedCount + partialCount, unmatchedCount }
    });

    console.log(`✅ [RECO UPLOAD SUCCESS] Batch ID: "${batch.id}" | Chain: "${detectedChain}" | Total Rows: ${recoRows.length} | Matched: ${matchedCount} | Partial: ${partialCount}`);
    console.log(`==================================================\n`);

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      detectedChain,
      summary: aiSummary,
      total: recoRows.length,
      matched: matchedCount,
      partial: partialCount,
      unmatched: unmatchedCount,
      fileName: file.name,
      imagekitUrl: ikRes?.url || null,
    });

  } catch (err: any) {
    if (filepath) {
      try { unlinkSync(filepath); } catch {}
    }
    console.error('❌ [RECO UPLOAD ERROR]', err);
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 });
  }
}
