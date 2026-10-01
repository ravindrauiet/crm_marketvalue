import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ValidationError, badRequest, cleanString, errorResponse, isObjectId, requireValidDate } from '@/lib/validation';

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
  if (!isObjectId(params.id)) return badRequest('Invalid PO id');
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');

    const data: Record<string, any> = {};
    if (body.status !== undefined) {
      const status = cleanString(body.status, 50);
      if (!status) throw new ValidationError('Status cannot be blank');
      data.status = status;
    }
    if (body.planningNote !== undefined) data.planningNote = cleanString(body.planningNote, 2000) || null;
    if (body.notes !== undefined) data.notes = cleanString(body.notes, 2000) || null;
    // Empty string = leave unchanged (as before); null clears the date
    if (body.appointmentDate === null) data.appointmentDate = null;
    else if (body.appointmentDate) data.appointmentDate = requireValidDate(body.appointmentDate, 'Appointment date');
    if (body.deliveryDate === null) data.deliveryDate = null;
    else if (body.deliveryDate) data.deliveryDate = requireValidDate(body.deliveryDate, 'Delivery / expiry date');

    const po = await prisma.chainPurchaseOrder.update({
      where: { id: params.id },
      data,
      include: { items: true }
    });
    return NextResponse.json(po);
  } catch (err) {
    return errorResponse(err, 'Failed to update PO');
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
