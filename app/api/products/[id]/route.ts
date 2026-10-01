import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { productUpdateData } from '@/lib/productInput';
import { badRequest, errorResponse, isObjectId } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isObjectId(params.id)) return badRequest('Invalid product id');
  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        stocks: true,
        stockTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isObjectId(params.id)) return badRequest('Invalid product id');
  try {
    const body = await req.json().catch(() => null);
    // Only fields that were sent are changed (an omitted price is no longer wiped)
    const product = await prisma.product.update({
      where: { id: params.id },
      data: productUpdateData(body)
    });
    return NextResponse.json(product);
  } catch (error: any) {
    return errorResponse(error, 'Failed to update product');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isObjectId(params.id)) return badRequest('Invalid product id');
  try {
    const used = await prisma.orderItem.count({ where: { productId: params.id } });
    if (used > 0) return badRequest('This product is used in orders and cannot be deleted', 409);
    await prisma.product.delete({
      where: { id: params.id }
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}





