import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
  try {
    const data = await req.json();
    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: data.name,
        brand: data.brand,
        group: data.group,
        description: data.description,
        price: data.price ? parseFloat(data.price) : null,
        cost: data.cost ? parseFloat(data.cost) : null,
        minStockThreshold: data.minStockThreshold ? parseInt(data.minStockThreshold) : undefined
      }
    });
    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.product.delete({
      where: { id: params.id }
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}





