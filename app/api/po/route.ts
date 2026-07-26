import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const chain = req.nextUrl.searchParams.get('chain');
    const status = req.nextUrl.searchParams.get('status');
    const orders = await prisma.chainPurchaseOrder.findMany({
      where: {
        ...(chain ? { chainName: chain } : {}),
        ...(status ? { status } : {}),
      },
      include: { items: true },
      orderBy: { poDate: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch POs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { poNumber, chainName, poDate, appointmentDate, deliveryDate, notes, filePath, fileName, rawDocumentInfo, items } = body;

    if (!poNumber || !chainName) {
      return NextResponse.json({ error: 'poNumber and chainName are required' }, { status: 400 });
    }

    // Check for existing PO number
    const existing = await prisma.chainPurchaseOrder.findUnique({ where: { poNumber } });
    if (existing) {
      return NextResponse.json({ error: `PO ${poNumber} already exists` }, { status: 409 });
    }

    // Fetch mappings to auto-populate tally info and CASE qty
    const chainItems = (items || []) as any[];

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
      const quantityCase = item.quantityPcs / pcsPerCase;
      return {
        chainItemCode: code,
        chainItemName: name,
        tallyItemName: mapping?.tallyItemName || item.tallyItemName || '',
        eanCode: item.eanCode || mapping?.eanCode || null,
        hsnCode: item.hsnCode || null,
        quantityPcs: parseInt(item.quantityPcs || 0),
        quantityCase,
        unitPrice: parseFloat(item.unitPrice || 0),
        totalPrice: parseFloat(item.quantityPcs || 0) * parseFloat(item.unitPrice || 0),
        mappingId: mapping?.id || null,
      };
    }));

    const totalAmount = enrichedItems.reduce((sum, i) => sum + i.totalPrice, 0);

    const po = await prisma.chainPurchaseOrder.create({
      data: {
        poNumber,
        chainName: chainName.toUpperCase(),
        poDate: poDate ? new Date(poDate) : new Date(),
        appointmentDate: appointmentDate ? new Date(appointmentDate) : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        totalAmount,
        notes: notes || null,
        filePath: filePath || null,
        fileName: fileName || null,
        rawDocumentInfo: typeof rawDocumentInfo === 'object' ? JSON.stringify(rawDocumentInfo) : (rawDocumentInfo || null),
        items: { create: enrichedItems }
      },
      include: { items: true }
    });
    return NextResponse.json(po, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create PO' }, { status: 500 });
  }
}
