import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ValidationError, cleanString, errorResponse, requireValidDate, toNumber } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const chain = req.nextUrl.searchParams.get('chain');
    const status = req.nextUrl.searchParams.get('status');
    const orders = await prisma.chainPurchaseOrder.findMany({
      where: {
        ...(chain ? { chainName: { equals: chain.toUpperCase(), mode: 'insensitive' } } : {}),
        // No status filter = everything except soft-deleted (REMOVED) POs
        ...(status ? { status } : { status: { not: 'REMOVED' } }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch POs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');
    const { notes, filePath, fileName, imagekitUrl, rawDocumentInfo } = body;
    const poNumber = cleanString(body.poNumber, 100);
    const chainName = cleanString(body.chainName, 50).toUpperCase();

    if (!poNumber || !chainName) {
      return NextResponse.json({ error: 'poNumber and chainName are required' }, { status: 400 });
    }

    // Invalid dates are rejected instead of silently becoming today's date
    const poDate = requireValidDate(body.poDate, 'PO date') || new Date();
    const appointmentDate = requireValidDate(body.appointmentDate, 'Appointment date');
    const deliveryDate = requireValidDate(body.deliveryDate, 'Delivery / expiry date');

    if (body.items !== undefined && !Array.isArray(body.items)) throw new ValidationError('items must be a list');
    const items = ((body.items || []) as any[]).map((item: any, idx: number) => {
      const line = `Item ${idx + 1}`;
      const qty = toNumber(item?.quantityPcs);
      const price = toNumber(item?.unitPrice) ?? 0;
      if (!cleanString(item?.chainItemCode) && !cleanString(item?.chainItemName)) {
        throw new ValidationError(`${line}: item code or item name is required`);
      }
      if (qty === null || !Number.isInteger(qty) || qty < 0) throw new ValidationError(`${line}: quantity (pcs) must be a whole number of 0 or more`);
      if (price < 0) throw new ValidationError(`${line}: unit price cannot be negative`);
      return { ...item, quantityPcs: qty, unitPrice: price };
    });

    // Check for existing PO number
    const existing = await prisma.chainPurchaseOrder.findUnique({ where: { poNumber } });
    if (existing) {
      return NextResponse.json({ error: `PO ${poNumber} already exists` }, { status: 409 });
    }

    // Fetch mappings to auto-populate tally info and CASE qty
    const chainItems = items;

    // Enrich each item with mapping info
    const enrichedItems = await Promise.all(chainItems.map(async (item: any) => {
      const code = String(item.chainItemCode || '').trim();
      const name = String(item.chainItemName || '').trim();
      const ean = String(item.eanCode || '').trim();

      let mapping = null;
      if (code) {
        mapping = await prisma.itemMapping.findFirst({
          where: {
            chainName: chainName.toUpperCase(),
            isActive: true,
            OR: [
              { chainItemCode: { equals: code, mode: 'insensitive' } },
              { eanCode: { equals: code, mode: 'insensitive' } },
            ]
          },
          orderBy: { updatedAt: 'desc' },
        });
      }
      if (!mapping && ean) {
        mapping = await prisma.itemMapping.findFirst({
          where: { eanCode: { equals: ean, mode: 'insensitive' }, chainName: chainName.toUpperCase(), isActive: true },
          orderBy: { updatedAt: 'desc' },
        });
      }
      if (!mapping && name) {
        mapping = await prisma.itemMapping.findFirst({
          where: { chainItemName: { equals: name, mode: 'insensitive' }, chainName: chainName.toUpperCase(), isActive: true },
          orderBy: { updatedAt: 'desc' },
        });
      }

      const pcsPerCase = mapping?.pcsPerCase || 1;
      const quantityCase = item.quantityPcs / (pcsPerCase || 1);
      return {
        chainItemCode: code,
        chainItemName: name,
        tallyItemName: mapping?.tallyItemName || item.tallyItemName || '',
        eanCode: item.eanCode || mapping?.eanCode || null,
        hsnCode: item.hsnCode || null,
        quantityPcs: item.quantityPcs,
        quantityCase,
        unitPrice: item.unitPrice,
        totalPrice: item.quantityPcs * item.unitPrice,
        mappingId: mapping?.id || null,
      };
    }));

    const totalAmount = enrichedItems.reduce((sum, i) => sum + i.totalPrice, 0);

    const po = await prisma.chainPurchaseOrder.create({
      data: {
        poNumber,
        chainName: chainName.toUpperCase(),
        poDate,
        appointmentDate,
        deliveryDate,
        totalAmount,
        notes: notes || null,
        filePath: filePath || null,
        fileName: fileName || null,
        imagekitUrl: imagekitUrl || null,
        rawDocumentInfo: typeof rawDocumentInfo === 'object' ? JSON.stringify(rawDocumentInfo) : (rawDocumentInfo || null),
        items: { create: enrichedItems }
      },
      include: { items: true }
    });
    return NextResponse.json(po, { status: 201 });
  } catch (err) {
    console.error(err);
    return errorResponse(err, 'Failed to create PO');
  }
}
