import { NextRequest, NextResponse } from 'next/server';
import { listProducts } from '@/lib/products';
import { prisma } from '@/lib/prisma';

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
    const data = await req.json();

    // Validate required fields
    if (!data.sku || !data.name) {
      return NextResponse.json({ error: 'SKU and Name are required' }, { status: 400 });
    }

    // Check if SKU already exists
    const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) {
      return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 400 });
    }

    // Create the product
    const product = await prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        brand: data.brand || null,
        group: data.group || null,
        description: data.description || null,
        price: data.price ? parseFloat(data.price) : null,
        cost: data.cost ? parseFloat(data.cost) : null,
        minStockThreshold: data.minStockThreshold ? parseInt(data.minStockThreshold) : 10,
      }
    });

    // Create initial stock entry if quantity provided
    if (data.initialStock && parseInt(data.initialStock) > 0) {
      await prisma.stock.create({
        data: {
          productId: product.id,
          location: 'TOTAL',
          quantity: parseInt(data.initialStock),
        }
      });
    }

    return NextResponse.json(product);
  } catch (error: any) {
    console.error('Failed to create product:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





