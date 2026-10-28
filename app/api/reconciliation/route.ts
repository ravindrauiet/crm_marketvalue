import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { badRequest, isObjectId } from '@/lib/validation';
import { classifyLine, isDeductionKind, lineAmount, noteKind, isManual } from '@/lib/recoMatch';

const ROW_LIMIT = 2000;

// GET /api/reconciliation?batchId=&status=
// Statement lines with their kind (payment, TDS, claim…), plus totals over all matching lines
export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get('batchId');
    const status = req.nextUrl.searchParams.get('status');
    if (batchId && !isObjectId(batchId)) return badRequest('Invalid batchId');
    const where = { ...(batchId ? { batchId } : {}), ...(status ? { matchStatus: status } : {}) };

    const [lines, batches] = await Promise.all([
      prisma.paymentReco.findMany({ where, orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }] }),
      prisma.recoBatch.findMany({ orderBy: { uploadedAt: 'desc' } }),
    ]);

    const rows = lines.map(l => ({ ...l, kind: noteKind(l.notes) || classifyLine(l), amount: lineAmount(l), manual: isManual(l.notes) }));
    const active = rows.filter(r => r.matchStatus !== 'IGNORED');
    const summary = {
      received: active.filter(r => r.kind === 'PAYMENT').reduce((s, r) => s + r.amount, 0),
      deductions: active.reduce((s, r) => s + (isDeductionKind(r.kind) ? r.amount : r.kind === 'PAYMENT' ? Math.abs(r.deductionAmount || 0) : 0), 0),
      matched: rows.filter(r => r.matchStatus === 'MATCHED').length,
      unmatched: rows.filter(r => r.matchStatus === 'UNMATCHED' || r.matchStatus === 'PARTIAL').length,
      unmatchedAmount: rows.filter(r => r.matchStatus === 'UNMATCHED' || r.matchStatus === 'PARTIAL').reduce((s, r) => s + r.amount, 0),
      ignored: rows.filter(r => r.matchStatus === 'IGNORED').length,
      totalRows: rows.length,
      rowsShown: Math.min(rows.length, ROW_LIMIT),
    };

    return NextResponse.json({ rows: rows.slice(0, ROW_LIMIT), batches, summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
}

// DELETE /api/reconciliation?batchId=… (one upload) or ?resetAll=true (everything)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');

    if (searchParams.get('resetAll') === 'true') {
      const recoRes = await prisma.paymentReco.deleteMany({});
      const batchRes = await prisma.recoBatch.deleteMany({});
      return NextResponse.json({ success: true, message: `Cleared ${recoRes.count} lines and ${batchRes.count} uploads` });
    }

    if (batchId) {
      if (!isObjectId(batchId)) return badRequest('Invalid batchId');
      const recoRes = await prisma.paymentReco.deleteMany({ where: { batchId } });
      await prisma.recoBatch.delete({ where: { id: batchId } });
      return NextResponse.json({ success: true, message: `Deleted the upload and its ${recoRes.count} lines` });
    }

    return NextResponse.json({ error: 'batchId or resetAll parameter required' }, { status: 400 });
  } catch (err: any) {
    console.error('❌ [RECO DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete reconciliation data: ' + err.message }, { status: 500 });
  }
}
