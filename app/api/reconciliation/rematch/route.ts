import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadInvoiceIndex } from '@/lib/recoData';
import { KIND_LABEL, isDeductionKind, isManual, matchFields, matchLine, withNotes } from '@/lib/recoMatch';

export const runtime = 'nodejs';

// POST /api/reconciliation/rematch
// Re-runs matching on every saved line (new Tally invoices may have been uploaded since).
// Lines matched or ignored by hand are left as they are.
export async function POST() {
  try {
    const [index, lines] = await Promise.all([loadInvoiceIndex(), prisma.paymentReco.findMany()]);
    const todo = lines.filter(l => l.matchStatus !== 'IGNORED' && !isManual(l.notes));

    const updates = todo.map(l => {
      const m = matchLine({
        narration: l.narration, creditAmount: l.creditAmount, debitAmount: l.debitAmount,
        invoiceNumber: l.matchedInvoiceNo, poNumber: l.matchedPoNumber, deductionReason: l.deductionReason, chainName: l.chainName,
      }, index, true);
      // TDS printed beside a payment is a few % at most (194Q 0.1%, 194C 1–2%). Larger figures were the
      // old matcher's "payment minus invoice" difference (mostly GST), not a deduction.
      const stored = Math.abs(l.deductionAmount || 0);
      const besideTds = isDeductionKind(m.kind) || stored > m.amount * 0.05 ? 0 : stored;
      return prisma.paymentReco.update({
        where: { id: l.id },
        data: {
          ...matchFields(m, besideTds),
          deductionReason: isDeductionKind(m.kind) ? (l.deductionReason && !/^-?$/.test(l.deductionReason) ? l.deductionReason : KIND_LABEL[m.kind]) : l.deductionReason,
          notes: withNotes(l.notes, m.kind, false),
        },
      });
    });
    for (let i = 0; i < updates.length; i += 50) await prisma.$transaction(updates.slice(i, i + 50));

    // Batch counters follow their lines
    const counts = await prisma.paymentReco.groupBy({ by: ['batchId', 'matchStatus'], _count: { _all: true } });
    const batches = await prisma.recoBatch.findMany({ select: { id: true } });
    await prisma.$transaction(batches.map(b => {
      const of = (s: string) => counts.find(c => c.batchId === b.id && c.matchStatus === s)?._count._all || 0;
      return prisma.recoBatch.update({ where: { id: b.id }, data: { matchedCount: of('MATCHED'), unmatchedCount: of('UNMATCHED') + of('PARTIAL') } });
    }));

    const after = await prisma.paymentReco.groupBy({ by: ['matchStatus'], _count: { _all: true } });
    return NextResponse.json({
      success: true,
      checked: todo.length,
      keptManual: lines.length - todo.length,
      byStatus: Object.fromEntries(after.map(a => [a.matchStatus, a._count._all])),
    });
  } catch (err: any) {
    console.error('❌ [RECO REMATCH ERROR]', err);
    return NextResponse.json({ error: 'Re-match failed: ' + err.message }, { status: 500 });
  }
}
