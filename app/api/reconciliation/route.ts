import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { badRequest, isObjectId } from '@/lib/validation';

const ROW_LIMIT = 2000;

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get('batchId');
    const status = req.nextUrl.searchParams.get('status');

    if (batchId && !isObjectId(batchId)) return badRequest('Invalid batchId');
    const where = {
      ...(batchId ? { batchId } : {}),
      ...(status ? { matchStatus: status } : {}),
    };

    const [rows, batches, groups, totalCount] = await Promise.all([
      prisma.paymentReco.findMany({
        where,
        orderBy: { txnDate: 'desc' },
        take: ROW_LIMIT,
      }),
      prisma.recoBatch.findMany({ orderBy: { uploadedAt: 'desc' } }),
      // Totals are computed over ALL matching rows, not just the rows returned
      prisma.paymentReco.groupBy({
        by: ['matchStatus'],
        where,
        _count: { _all: true },
        _sum: { creditAmount: true, pendingAmount: true },
      }),
      prisma.paymentReco.count({ where }),
    ]);

    const byStatus = (s: string) => groups.find(g => g.matchStatus === s);
    const summary = {
      totalCredit: groups.reduce((s, g) => s + (g._sum.creditAmount || 0), 0),
      totalMatched: byStatus('MATCHED')?._count._all || 0,
      totalPartial: byStatus('PARTIAL')?._count._all || 0,
      totalUnmatched: byStatus('UNMATCHED')?._count._all || 0,
      totalPending: groups.filter(g => g.matchStatus !== 'MATCHED').reduce((s, g) => s + (g._sum.pendingAmount || 0), 0),
      totalRows: totalCount,
      rowsShown: rows.length,
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
      if (!isObjectId(batchId)) return badRequest('Invalid batchId');
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
