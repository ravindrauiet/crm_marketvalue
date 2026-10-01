import { NextRequest, NextResponse } from 'next/server';
import { getOrder, updateOrderStatus } from '@/lib/orders';
import { badRequest, errorResponse, isObjectId } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isObjectId(params.id)) return badRequest('Invalid order id');
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
    const data = await req.json().catch(() => null);
    if (data?.status) {
      const order = await updateOrderStatus(params.id, data.status);
      return NextResponse.json(order);
    }
    return badRequest('Invalid update: status is required');
  } catch (error: any) {
    return errorResponse(error, 'Failed to update order');
  }
}
