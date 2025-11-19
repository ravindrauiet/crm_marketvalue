import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { productId, quantity, reason, notes } = await req.json();

    if (!productId || quantity === undefined) {
      return NextResponse.json({ error: 'Product ID and quantity are required' }, { status: 400 });
    }

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
    const newQty = Math.max(0, quantity);

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
        reason: reason || 'ADJUSTMENT',
        notes: notes || null
      }
    });

    return NextResponse.json({ 
      ok: true, 
      previousQty, 
      newQty,
      change: newQty - previousQty
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}





