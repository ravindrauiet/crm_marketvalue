import { NextRequest, NextResponse } from 'next/server';
import { listProducts } from '@/lib/products';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const q = searchParams.get('q') || undefined;
  const status = searchParams.get('status') as 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | undefined;
  
  try {
    const products = await listProducts(q, status);
    return NextResponse.json(products);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


