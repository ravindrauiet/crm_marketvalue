import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const po = await prisma.chainPurchaseOrder.findUnique({
      where: { id: params.id },
      include: { items: true }
    });
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json(po);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch PO' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const po = await prisma.chainPurchaseOrder.update({
      where: { id: params.id },
      data: {
        status: body.status,
        planningNote: body.planningNote,
        appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : undefined,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : undefined,
        notes: body.notes,
      },
      include: { items: true }
    });
    return NextResponse.json(po);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update PO' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.chainPurchaseOrder.update({
      where: { id: params.id },
      data: { status: 'REMOVED' }
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to remove PO' }, { status: 500 });
  }
}
