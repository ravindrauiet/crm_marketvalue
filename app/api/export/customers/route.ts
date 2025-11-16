import { NextRequest, NextResponse } from 'next/server';
import { exportCustomersToExcel } from '@/lib/export';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const buffer = await exportCustomersToExcel();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




