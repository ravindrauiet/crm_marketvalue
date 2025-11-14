import { NextRequest, NextResponse } from 'next/server';
import { listOrders, createOrder, generateOrderNumber } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const filters: any = {};
  
  if (searchParams.get('type')) filters.type = searchParams.get('type');
  if (searchParams.get('status')) filters.status = searchParams.get('status');
  if (searchParams.get('customerId')) filters.customerId = searchParams.get('customerId');
  if (searchParams.get('startDate')) filters.startDate = new Date(searchParams.get('startDate')!);
  if (searchParams.get('endDate')) filters.endDate = new Date(searchParams.get('endDate')!);

  const orders = await listOrders(filters);
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    // Generate order number if not provided
    if (!data.orderNumber) {
      data.orderNumber = await generateOrderNumber(data.type);
    }
    
    const order = await createOrder(data);
    return NextResponse.json(order);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

