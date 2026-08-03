import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get('batchId');
    const status = req.nextUrl.searchParams.get('status');

    const [rows, batches] = await Promise.all([
      prisma.paymentReco.findMany({
        where: {
          ...(batchId ? { batchId } : {}),
          ...(status ? { matchStatus: status } : {}),
        },
        orderBy: { txnDate: 'desc' },
        take: 1000,
      }),
      prisma.recoBatch.findMany({ orderBy: { uploadedAt: 'desc' } })
    ]);

    // Summary stats
    const summary = {
      totalCredit: rows.reduce((s, r) => s + r.creditAmount, 0),
      totalMatched: rows.filter(r => r.matchStatus === 'MATCHED').length,
      totalPartial: rows.filter(r => r.matchStatus === 'PARTIAL').length,
      totalUnmatched: rows.filter(r => r.matchStatus === 'UNMATCHED').length,
      totalPending: rows.filter(r => r.matchStatus !== 'MATCHED').reduce((s, r) => s + r.pendingAmount, 0),
    };

    return NextResponse.json({ rows, batches, summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
}

// DELETE /api/reconciliation - Clear all reconciliation data or specific batch
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const resetAll = searchParams.get('resetAll');

    if (resetAll === 'true') {
      const [recoRes, batchRes] = await Promise.all([
        prisma.paymentReco.deleteMany({}),
        prisma.recoBatch.deleteMany({})
      ]);
      return NextResponse.json({
        success: true,
        message: `Cleared ${recoRes.count} reconciliation entries and ${batchRes.count} batches`
      });
    }

    if (batchId) {
      const [recoRes] = await Promise.all([
        prisma.paymentReco.deleteMany({ where: { batchId } }),
        prisma.recoBatch.delete({ where: { id: batchId } })
      ]);
      return NextResponse.json({
        success: true,
        message: `Deleted batch ${batchId} and ${recoRes.count} rows`
      });
    }

    return NextResponse.json({ error: 'batchId or resetAll parameter required' }, { status: 400 });
  } catch (err: any) {
    console.error('❌ [RECO DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete reconciliation data: ' + err.message }, { status: 500 });
  }
}
