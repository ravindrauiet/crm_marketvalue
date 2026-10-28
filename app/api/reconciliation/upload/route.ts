import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadToImageKit } from '@/lib/imagekit';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { extractRecoWithAI } from '@/lib/ai';
import { unlinkSync } from 'fs';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { detectRecoChain, parseRecoSpreadsheet } from '@/lib/recoParsers';
import { parseDate } from '@/lib/validation';
import { KIND_LABEL, isDeductionKind, matchFields, matchLine, withNotes } from '@/lib/recoMatch';
import { loadInvoiceIndex } from '@/lib/recoData';

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

    const isExcel = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls') || mimeTypeLower.includes('excel') || mimeTypeLower.includes('spreadsheet');
    const isCsv = fileNameLower.endsWith('.csv') || mimeTypeLower.includes('csv');
    // Pasted payment-advice text is usually a tab-separated table; free-form text still goes to AI
    const isText = fileNameLower.endsWith('.txt') || mimeTypeLower.startsWith('text/plain');

    // 0. Excel / CSV ledgers and statements: read every row directly (fast, no AI, no timeouts)
    let sheetHeaderText = '';
    if (isExcel || isCsv || isText) {
      try {
        const sheet = parseRecoSpreadsheet(buffer);
        if (sheet && sheet.rows.length) {
          sheetHeaderText = sheet.headerText;
          normalizedRows = sheet.rows.map(r => ({
            dateRaw: r.txnDate,
            narration: r.narration,
            debitAmount: r.debitAmount,
            creditAmount: r.creditAmount,
            balance: r.balance,
            bankRef: r.bankRef,
            poNumber: r.poNumber,
            invoiceNumber: r.invoiceNumber,
            deductionReason: r.deductionReason,
            tdsAmount: r.deductionReason ? r.debitAmount : 0,
          }));
          console.log(`📊 [RECO UPLOAD API] Direct sheet parse: ${normalizedRows.length} rows | columns ${JSON.stringify(sheet.columns)}`);
        }
      } catch (sheetErr: any) {
        console.warn('Sheet parse notice:', sheetErr.message);
      }
    }

    // 1. AI extraction for PDFs, pasted text and documents without a readable table
    if (normalizedRows.length === 0) try {
      console.log(`🤖 [RECO UPLOAD API] Running AI Extraction for Reconciliation Statement...`);
      const aiResult = await extractRecoWithAI(filepath, mimeTypeLower, statementType, chainNameHint, ikRes?.url);
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
          if (/%%EOF|startxref|xref|trailer|endobj|\/Root|\/Info|\/Title|\/Producer|00000\d{5}/i.test(line)) continue;
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

    // 3. Fallback: Check if Excel / CSV table (ONLY for actual Excel / CSV files)
    if (normalizedRows.length === 0 && (isExcel || isCsv)) {
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
    // File name and document header first; UTR prefixes like "HSBCN…" (the payer's bank) are ignored
    const docText = `${sheetHeaderText} ${aiSummary?.remitterName || ''} ${aiSummary?.payeeName === 'GLOMIN OVERSEAS' ? '' : aiSummary?.payeeName || ''}`;
    let detectedChain = detectRecoChain(file.name, docText, chainNameHint);
    if (detectedChain === 'OTHER') {
      detectedChain = detectRecoChain('', normalizedRows.slice(0, 50).map(r => `${r.narration}`).join(' '));
    }
    if (detectedChain === 'OTHER' && aiSummary?.chainName && aiSummary.chainName !== 'HSBC') detectedChain = aiSummary.chainName;
    aiSummary.chainName = detectedChain;

    console.log(`ℹ️ [RECO UPLOAD API] Final Auto-Detected Chain: "${detectedChain}"`);

    // Match every line to a Tally sale invoice (by invoice number, else a PO billed in one invoice)
    const index = await loadInvoiceIndex();
    const prepared = normalizedRows.map(row => {
      const creditAmount = row.creditAmount || (row.netAmount && row.netAmount > 0 ? row.netAmount : 0);
      const debitAmount = row.debitAmount || (row.netAmount && row.netAmount < 0 ? Math.abs(row.netAmount) : 0);
      const line = {
        narration: row.narration || row.deductionReason || 'Payment advice line',
        creditAmount, debitAmount,
        invoiceNumber: row.invoiceNumber || row.refDocNo || '',
        poNumber: row.poNumber || '',
        deductionReason: row.deductionReason || '',
        chainName: detectedChain,
      };
      const m = matchLine(line, index);
      // Day-first parsing for documents like "23/08/2026" (new Date() would read it month-first)
      const txnDate: Date | null = row.dateRaw ? parseDate(row.dateRaw) : null;
      return {
        // Duplicate check uses what the document says, not the match result (which can change)
        key: [txnDate ? txnDate.toISOString().slice(0, 10) : '', (line.invoiceNumber || '').toUpperCase(), creditAmount.toFixed(2), debitAmount.toFixed(2), (row.bankRef || '').toUpperCase(), line.narration.slice(0, 60)].join('|'),
        data: {
          batchId: '',
          txnDate,
          narration: line.narration,
          debitAmount,
          creditAmount,
          balance: row.balance || 0,
          bankRef: row.bankRef || aiSummary?.paymentRefNo || null,
          ...matchFields(m, row.tdsAmount || 0),
          deductionReason: row.deductionReason || (isDeductionKind(m.kind) ? KIND_LABEL[m.kind] : null),
          notes: withNotes(`Source: ${statementType.toUpperCase()}`, m.kind, false),
        },
      };
    });

    const existingKeys = new Set((await prisma.paymentReco.findMany({
      select: { txnDate: true, narration: true, creditAmount: true, debitAmount: true, bankRef: true, matchedInvoiceNo: true },
    })).flatMap(r => {
      const base = (inv: string) => [r.txnDate ? r.txnDate.toISOString().slice(0, 10) : '', inv, r.creditAmount.toFixed(2), r.debitAmount.toFixed(2), (r.bankRef || '').toUpperCase(), (r.narration || '').slice(0, 60)].join('|');
      return [base((r.matchedInvoiceNo || '').toUpperCase()), base('')];
    }));
    // Only lines saved by an EARLIER upload are skipped; identical lines inside one file
    // (e.g. two equal TDS deductions on an invoice) are genuine and kept
    const fresh = prepared.filter(p => !existingKeys.has(p.key) && !existingKeys.has(p.key.replace(/^([^|]*)\|[^|]*\|/, '$1||')));
    const duplicatesSkipped = prepared.length - fresh.length;

    const totalCredit = fresh.reduce((s, p) => s + p.data.creditAmount, 0);
    const totalDebit = fresh.reduce((s, p) => s + p.data.debitAmount, 0);
    const matchedCount = fresh.filter(p => p.data.matchStatus === 'MATCHED').length;
    const unmatchedCount = fresh.length - matchedCount;

    const batch = await prisma.recoBatch.create({
      data: {
        fileName: file.name,
        rowCount: fresh.length,
        matchedCount,
        unmatchedCount,
        totalCredit,
        totalDebit,
        imagekitUrl: ikRes?.url || null,
        notes: `Chain: ${detectedChain} | Type: ${statementType.toUpperCase()}${aiSummary?.paymentRefNo ? ' | Ref: ' + aiSummary.paymentRefNo : ''}`,
      }
    });
    if (fresh.length) await prisma.paymentReco.createMany({ data: fresh.map(p => ({ ...p.data, batchId: batch.id })) });

    console.log(`✅ [RECO UPLOAD SUCCESS] Batch ID: "${batch.id}" | Chain: "${detectedChain}" | Rows: ${fresh.length} | Matched: ${matchedCount} | Duplicates skipped: ${duplicatesSkipped}`);
    console.log(`==================================================\n`);


    return NextResponse.json({
      success: true,
      batchId: batch.id,
      detectedChain,
      summary: aiSummary,
      total: fresh.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      duplicatesSkipped,
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
