import { NextRequest, NextResponse } from 'next/server';
import { listProducts } from '@/lib/products';
import { prisma } from '@/lib/prisma';
import { productCreateData } from '@/lib/productInput';
import { errorResponse } from '@/lib/validation';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { data, initialStock } = productCreateData(body);

    // Check if SKU already exists
    const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) {
      return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 409 });
    }

    const product = await prisma.product.create({ data });

    // Create initial stock entry if quantity provided
    if (initialStock > 0) {
      await prisma.stock.create({
        data: { productId: product.id, location: 'TOTAL', quantity: initialStock }
      });
    }

    return NextResponse.json(product);
  } catch (error: any) {
    console.error('Failed to create product:', error);
    return errorResponse(error, 'Failed to create product');
  }
}
