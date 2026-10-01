import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ValidationError, cleanString, errorResponse, isObjectId, toNumber } from '@/lib/validation';

export const runtime = 'nodejs';

// POST /api/stock/adjust  Body: { productId, quantity (new absolute stock), reason?, notes? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const productId = String(body?.productId || '');
    const quantity = toNumber(body?.quantity);

    if (!isObjectId(productId)) throw new ValidationError('A valid product ID is required');
    if (quantity === null) throw new ValidationError('Quantity is required');
    if (!Number.isInteger(quantity) || quantity < 0) throw new ValidationError('Quantity must be a whole number of 0 or more');

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new ValidationError('Product not found', 404);

    // Get current stock
    let stock = await prisma.stock.findFirst({
      where: { productId, location: 'TOTAL' }
    });

    if (!stock) {
      stock = await prisma.stock.create({
        data: {
          productId,
          location: 'TOTAL',
          quantity: 0
        }
      });
    }

    const previousQty = stock.quantity;
    const newQty = quantity;

    // Update stock
    await prisma.stock.update({
      where: { id: stock.id },
      data: { quantity: newQty }
    });

    // Create transaction record
    await prisma.stockTransaction.create({
      data: {
        productId,
        type: newQty > previousQty ? 'IN' : newQty < previousQty ? 'OUT' : 'ADJUSTMENT',
        quantity: Math.abs(newQty - previousQty),
        previousQty,
        newQty,
        reason: cleanString(body?.reason, 50) || 'ADJUSTMENT',
        notes: cleanString(body?.notes, 1000) || null
      }
    });

    return NextResponse.json({
      ok: true,
      previousQty,
      newQty,
      change: newQty - previousQty
    });
  } catch (error: any) {
    return errorResponse(error, 'Failed to adjust stock');
  }
}
