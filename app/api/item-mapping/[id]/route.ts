import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const mapping = await prisma.itemMapping.update({
      where: { id: params.id },
      data: {
        ...body,
        pcsPerCase: body.pcsPerCase ? parseInt(body.pcsPerCase) : undefined,
      }
    });
    return NextResponse.json(mapping);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.itemMapping.update({
      where: { id: params.id },
      data: { isActive: false }
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 });
  }
}
