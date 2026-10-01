import { NextRequest, NextResponse } from 'next/server';
import { listOrders, createOrder, ORDER_TYPES } from '@/lib/orders';
import { badRequest, errorResponse, isObjectId, parseDate } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const filters: any = {};

    const type = searchParams.get('type');
    if (type) {
      if (!ORDER_TYPES.includes(type.toUpperCase() as any)) return badRequest('type must be PURCHASE or SALE');
      filters.type = type.toUpperCase();
    }
    if (searchParams.get('status')) filters.status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    if (customerId) {
      if (!isObjectId(customerId)) return badRequest('Invalid customerId');
      filters.customerId = customerId;
    }
    for (const key of ['startDate', 'endDate'] as const) {
      const raw = searchParams.get(key);
      if (raw) {
        const d = parseDate(raw);
        if (!d) return badRequest(`${key} is not a valid date`);
        filters[key] = d;
      }
    }

    const orders = await listOrders(filters);
    return NextResponse.json(orders);
  } catch (error: any) {
    return errorResponse(error, 'Failed to load orders');
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => null);
    // Validation, order number generation and stock checks happen inside createOrder
    const order = await createOrder(data);
    return NextResponse.json(order);
  } catch (error: any) {
    return errorResponse(error, 'Failed to create order');
  }
}
