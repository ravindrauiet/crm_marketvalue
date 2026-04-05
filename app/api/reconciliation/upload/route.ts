import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';

// POST /api/reconciliation/upload
// Upload bank statement (Excel/CSV), auto-match with invoices
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel/CSV
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 });
    }

    // Normalize column names – handle different bank statement formats
    const normalizeRow = (row: any) => {
      const keys = Object.keys(row);
      const find = (patterns: string[]) => {
        for (const pattern of patterns) {
          const k = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
          if (k) return row[k];
        }
        return null;
      };

      const dateRaw = find(['date', 'txn date', 'transaction date', 'value date', 'posting date']);
      const narration = find(['narration', 'description', 'particulars', 'remarks', 'detail', 'transaction description']);
      const debit = find(['debit', 'withdrawal', 'dr', 'amount dr']);
      const credit = find(['credit', 'deposit', 'cr', 'amount cr']);
      const balance = find(['balance', 'closing balance']);
      const ref = find(['ref', 'chq', 'cheque', 'reference', 'txn ref', 'transaction id']);

      return {
        dateRaw,
        narration: String(narration || ''),
        debitAmount: parseFloat(String(debit).replace(/[^0-9.]/g, '')) || 0,
        creditAmount: parseFloat(String(credit).replace(/[^0-9.]/g, '')) || 0,
        balance: parseFloat(String(balance).replace(/[^0-9.]/g, '')) || 0,
        bankRef: String(ref || ''),
      };
    };

    const normalizedRows = rawRows.map(normalizeRow).filter(r => r.creditAmount > 0 || r.debitAmount > 0);

    if (normalizedRows.length === 0) {
      return NextResponse.json({ error: 'No valid transactions found. Check column names (Date, Narration, Credit/Debit).' }, { status: 400 });
    }

    // Fetch all invoices for matching
    const invoices = await prisma.invoice.findMany({
      select: { id: true, invoiceNumber: true, totalAmount: true, status: true, customer: { select: { name: true, company: true } } },
    });

    const pos = await prisma.chainPurchaseOrder.findMany({
      select: { id: true, poNumber: true, totalAmount: true, chainName: true }
    });

    // Auto-matching logic
    const autoMatch = (row: { narration: string; creditAmount: number }) => {
      const narr = row.narration.toLowerCase();
      const amt = row.creditAmount;

      // Try to match by invoice number
      for (const inv of invoices) {
        if (narr.includes(inv.invoiceNumber.toLowerCase())) {
          const diff = Math.abs(amt - inv.totalAmount);
          const isPartial = diff > 0.5 && diff < inv.totalAmount;
          return {
            matchStatus: diff < 0.5 ? 'MATCHED' : isPartial ? 'PARTIAL' : 'UNMATCHED',
            matchedInvoiceNo: inv.invoiceNumber,
            matchedAmount: Math.min(amt, inv.totalAmount),
            pendingAmount: Math.max(0, inv.totalAmount - amt),
            chainName: inv.customer?.company || inv.customer?.name || null,
          };
        }
      }

      // Try to match by PO number
      for (const po of pos) {
        if (narr.includes(po.poNumber.toLowerCase())) {
          const diff = Math.abs(amt - po.totalAmount);
          return {
            matchStatus: diff < 0.5 ? 'MATCHED' : 'PARTIAL',
            matchedPoNumber: po.poNumber,
            matchedAmount: Math.min(amt, po.totalAmount),
            pendingAmount: Math.max(0, po.totalAmount - amt),
            chainName: po.chainName,
          };
        }
      }

      // Try to identify chain by narration keywords
      const chainKeywords = [
        { key: 'flipkart', chain: 'FLIPKART' },
        { key: 'amazon', chain: 'AMAZON' },
        { key: 'zepto', chain: 'ZEPTO' },
        { key: 'blinkit', chain: 'BLINKIT' },
        { key: 'grofers', chain: 'BLINKIT' },
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

    // Create batch record first, get its id from MongoDB
    const batch = await prisma.recoBatch.create({
      data: {
        fileName: file.name,
        rowCount: normalizedRows.length,
        totalCredit: normalizedRows.reduce((s, r) => s + r.creditAmount, 0),
        totalDebit: normalizedRows.reduce((s, r) => s + r.debitAmount, 0),
      }
    });

    // Create rows
    const recoRows = normalizedRows.map(row => {
      const match = autoMatch(row);
      let txnDate: Date | null = null;
      if (row.dateRaw) {
        txnDate = row.dateRaw instanceof Date ? row.dateRaw : new Date(row.dateRaw);
        if (isNaN(txnDate.getTime())) txnDate = null;
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
        matchedInvoiceNo: match.matchedInvoiceNo || null,
        matchedPoNumber: match.matchedPoNumber || null,
        matchedAmount: match.matchedAmount || 0,
        pendingAmount: match.pendingAmount || row.creditAmount,
        chainName: match.chainName || null,
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
    console.error('Reconciliation upload error:', err);
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 });
  }
}
