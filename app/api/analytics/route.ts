import { NextRequest, NextResponse } from 'next/server';
import { getSalesAnalytics, getStockAnalytics, getRecentActivity } from '@/lib/analytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') || 'all';
  
  const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

  try {
    if (type === 'sales') {
      try {
        const analytics = await getSalesAnalytics(startDate, endDate);
        return NextResponse.json(analytics);
      } catch (error: any) {
        // Return empty data if Order table doesn't exist
        return NextResponse.json({
          totalRevenue: 0,
          totalOrders: 0,
          totalItems: 0,
          averageOrderValue: 0,
          topProducts: []
        });
      }
    }
    
    if (type === 'stock') {
      try {
        const analytics = await getStockAnalytics();
        return NextResponse.json(analytics);
      } catch (error: any) {
        // Return basic data if columns don't exist
        return NextResponse.json({
          totalValue: 0,
          totalProducts: 0,
          lowStockCount: 0,
          lowStockProducts: []
        });
      }
    }
    
    if (type === 'activity') {
      try {
        const activity = await getRecentActivity();
        return NextResponse.json(activity);
      } catch (error: any) {
        return NextResponse.json({
          recentOrders: [],
          recentTransactions: []
        });
      }
    }

    // Return all analytics
    const [sales, stock, activity] = await Promise.all([
      getSalesAnalytics(startDate, endDate).catch(() => ({
        totalRevenue: 0,
        totalOrders: 0,
        totalItems: 0,
        averageOrderValue: 0,
        topProducts: []
      })),
      getStockAnalytics().catch(() => ({
        totalValue: 0,
        totalProducts: 0,
        lowStockCount: 0,
        lowStockProducts: []
      })),
      getRecentActivity().catch(() => ({
        recentOrders: [],
        recentTransactions: []
      }))
    ]);

    return NextResponse.json({ sales, stock, activity });
  } catch (error: any) {
    console.error('Analytics error:', error);
    return NextResponse.json({ 
      error: 'Analytics unavailable. Please run database migration first.',
      details: error.message 
    }, { status: 500 });
  }
}

