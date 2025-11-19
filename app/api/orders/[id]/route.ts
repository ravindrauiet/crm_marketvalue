import { NextRequest, NextResponse } from 'next/server';
import { getOrder, updateOrderStatus } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = await getOrder(params.id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json(order);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await req.json();
    if (data.status) {
      const order = await updateOrderStatus(params.id, data.status);
      return NextResponse.json(order);
    }
    return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}





