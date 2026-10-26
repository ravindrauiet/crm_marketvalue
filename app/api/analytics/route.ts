import { NextRequest, NextResponse } from 'next/server';
import { getAnalytics, getSalesAnalytics, getStockAnalytics, getRecentActivity } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ?type=sales|stock|activity (default: all) · ?month=YYYY-MM|latest|all (sales only)
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'all';
  const month = req.nextUrl.searchParams.get('month') || 'all';

  try {
    if (type === 'sales') return NextResponse.json(await getSalesAnalytics(month));
    if (type === 'stock') return NextResponse.json(await getStockAnalytics());
    if (type === 'activity') return NextResponse.json(await getRecentActivity());
    return NextResponse.json(await getAnalytics(month));
  } catch (error: any) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Analytics unavailable', details: error.message }, { status: 500 });
  }
}
