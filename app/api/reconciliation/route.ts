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
        take: 500,
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
