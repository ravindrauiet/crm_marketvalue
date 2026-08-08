import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const chain = req.nextUrl.searchParams.get('chain');
    const status = req.nextUrl.searchParams.get('status');
    const orders = await prisma.chainPurchaseOrder.findMany({
      where: {
        ...(chain ? { chainName: { equals: chain.toUpperCase(), mode: 'insensitive' } } : {}),
        ...(status ? { status } : {}),
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

function parseFlexibleDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  const str = String(val).trim();
  if (!str) return new Date();

  // If YYYY-MM-DD standard format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00.000Z');
    if (!isNaN(d.getTime())) return d;
  }

  // 1. Check DD.MM.YYYY or DD.MM.YY
  const dotParts = str.split('.');
  if (dotParts.length === 3) {
    const day = parseInt(dotParts[0], 10);
    const month = parseInt(dotParts[1], 10) - 1;
    let year = parseInt(dotParts[2], 10);
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. Check DD/MM/YYYY or DD/MM/YY
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    const p0 = parseInt(slashParts[0], 10);
    const p1 = parseInt(slashParts[1], 10);
    let p2 = parseInt(slashParts[2], 10);
    if (p2 < 100) p2 += 2000;

    let day = p0;
    let month = p1 - 1;
    let year = p2;

    if (p0 > 12) {
      day = p0; month = p1 - 1;
    } else if (p1 > 12) {
      day = p1; month = p0 - 1;
    }

    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Check DD-MM-YYYY or DD-MM-YY
  const dashParts = str.split('-');
  if (dashParts.length === 3 && dashParts[0].length <= 2) {
    const p0 = parseInt(dashParts[0], 10);
    const p1 = parseInt(dashParts[1], 10);
    let p2 = parseInt(dashParts[2], 10);
    if (p2 < 100) p2 += 2000;

    let day = p0;
    let month = p1 - 1;
    let year = p2;

    if (p0 > 12) {
      day = p0; month = p1 - 1;
    } else if (p1 > 12) {
      day = p1; month = p0 - 1;
    }

    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Fallback to standard Date constructor
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { poNumber, chainName, poDate, appointmentDate, deliveryDate, notes, filePath, fileName, imagekitUrl, rawDocumentInfo, items } = body;

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
        poDate: parseFlexibleDate(poDate),
        appointmentDate: appointmentDate ? parseFlexibleDate(appointmentDate) : null,
        deliveryDate: deliveryDate ? parseFlexibleDate(deliveryDate) : null,
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
    return NextResponse.json({ error: 'Failed to create PO' }, { status: 500 });
  }
}
