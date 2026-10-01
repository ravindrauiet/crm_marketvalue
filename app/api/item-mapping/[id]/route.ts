import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { badRequest, isObjectId, pick } from '@/lib/validation';

const EDITABLE_FIELDS = [
  'chainName', 'chainItemCode', 'chainItemName', 'tallyItemName', 'tallyItemSku',
  'eanCode', 'brandName', 'companyItemCode', 'companyItemName', 'pcsPerCase', 'notes', 'isActive',
] as const;
const REQUIRED_TEXT = ['chainName', 'chainItemCode', 'chainItemName', 'tallyItemName'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isObjectId(params.id)) return badRequest('Invalid mapping id');
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return badRequest('Invalid request body');

    // Only known fields can be changed (id, createdAt, etc. are ignored)
    const data: Record<string, any> = pick(body, EDITABLE_FIELDS);

    for (const key of Object.keys(data)) {
      if (key === 'pcsPerCase' || key === 'isActive') continue;
      data[key] = data[key] === null || data[key] === undefined ? null : String(data[key]).trim();
    }
    for (const key of REQUIRED_TEXT) {
      if (key in data && !data[key]) return badRequest(`${key} cannot be blank`);
    }
    if (data.chainName) data.chainName = data.chainName.toUpperCase();
    if ('pcsPerCase' in data) {
      const pcs = Number(data.pcsPerCase);
      if (!Number.isInteger(pcs) || pcs < 1) return badRequest('Pcs per case must be a whole number of 1 or more');
      data.pcsPerCase = pcs;
    }
    if ('isActive' in data) data.isActive = data.isActive === true || data.isActive === 'true';

    if (data.chainName || data.chainItemCode) {
      const current = await prisma.itemMapping.findUnique({ where: { id: params.id } });
      if (!current) return badRequest('Mapping not found', 404);
      const clash = await prisma.itemMapping.findFirst({
        where: {
          id: { not: params.id },
          chainName: data.chainName || current.chainName,
          chainItemCode: { equals: data.chainItemCode || current.chainItemCode, mode: 'insensitive' },
        }
      });
      if (clash) return badRequest('Another mapping already uses this chain + item code', 409);
    }

    const mapping = await prisma.itemMapping.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(mapping);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isObjectId(params.id)) return badRequest('Invalid mapping id');
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
