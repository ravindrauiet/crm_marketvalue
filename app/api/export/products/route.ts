import { NextRequest, NextResponse } from 'next/server';
import { exportProductsToExcel } from '@/lib/export';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const buffer = await exportProductsToExcel();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="products-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


