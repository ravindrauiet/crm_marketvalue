import { NextRequest, NextResponse } from 'next/server';
import { getSalesAnalytics, getStockAnalytics, getRecentActivity } from '@/lib/analytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') || 'all';
  
  const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

  if (type === 'sales') {
    const analytics = await getSalesAnalytics(startDate, endDate);
    return NextResponse.json(analytics);
  }
  
  if (type === 'stock') {
    const analytics = await getStockAnalytics();
    return NextResponse.json(analytics);
  }
  
  if (type === 'activity') {
    const activity = await getRecentActivity();
    return NextResponse.json(activity);
  }

  // Return all analytics
  const [sales, stock, activity] = await Promise.all([
    getSalesAnalytics(startDate, endDate),
    getStockAnalytics(),
    getRecentActivity()
  ]);

  return NextResponse.json({ sales, stock, activity });
}

