import { NextRequest, NextResponse } from 'next/server';
import { badRequest, errorResponse, isObjectId } from '@/lib/validation';
import { getCustomer, updateCustomer, deleteCustomer } from '@/lib/customers';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isObjectId(params.id)) return badRequest('Invalid customer id');
  const customer = await getCustomer(params.id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  return NextResponse.json(customer);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await req.json().catch(() => null);
    const customer = await updateCustomer(params.id, data);
    return NextResponse.json(customer);
  } catch (error: any) {
    return errorResponse(error, 'Customer request failed');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteCustomer(params.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return errorResponse(error, 'Customer request failed');
  }
}





