import { NextRequest, NextResponse } from 'next/server';
import { exportOrdersToExcel } from '@/lib/export';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type') as 'PURCHASE' | 'SALE' | undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

    const buffer = await exportOrdersToExcel(type, startDate, endDate);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





