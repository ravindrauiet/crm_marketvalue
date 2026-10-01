import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { ValidationError, cleanString, errorResponse, isObjectId, nextSequenceNumber, toNumber } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const grns = await prisma.grn.findMany({
            include: {
                order: {
                    select: { orderNumber: true, customer: { select: { name: true, company: true } } }
                },
                _count: { select: { items: true } }
            },
            orderBy: { receivedDate: 'desc' }
        });
        return NextResponse.json(grns);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const orderId = String(body?.orderId || '');
        if (!isObjectId(orderId)) throw new ValidationError('A valid Order ID is required');
        if (!Array.isArray(body.items) || body.items.length === 0) throw new ValidationError('At least one received item is required');

        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) throw new ValidationError('Order not found', 404);
        if (order.status === 'CANCELLED') throw new ValidationError('Cannot receive goods for a cancelled order');

        const orderProductIds = new Set(order.items.map(i => i.productId));
        const items = body.items.map((item: any, idx: number) => {
            const line = `Item ${idx + 1}`;
            const productId = String(item?.productId || '');
            const received = toNumber(item?.quantityReceived);
            const rejected = toNumber(item?.quantityRejected) ?? 0;
            if (!orderProductIds.has(productId)) throw new ValidationError(`${line}: product is not part of this order`);
            if (received === null || !Number.isInteger(received) || received < 0) throw new ValidationError(`${line}: received quantity must be a whole number of 0 or more`);
            if (!Number.isInteger(rejected) || rejected < 0) throw new ValidationError(`${line}: rejected quantity must be a whole number of 0 or more`);
            if (rejected > received) throw new ValidationError(`${line}: rejected quantity cannot be more than received`);
            return {
                productId,
                quantityReceived: received,
                quantityRejected: rejected,
                rejectionReason: cleanString(item?.rejectionReason, 500) || null
            };
        });

        const grnNumber = await nextSequenceNumber('GRN', async prefix =>
            (await prisma.grn.findMany({ where: { grnNumber: { startsWith: prefix } }, select: { grnNumber: true } }))
                .map(g => g.grnNumber)
        );

        const grn = await prisma.$transaction(async tx => {
            const created = await tx.grn.create({
                data: {
                    grnNumber,
                    receivedDate: new Date(),
                    orderId,
                    note: cleanString(body.note, 1000) || null,
                    items: { create: items }
                }
            });
            await tx.order.update({
                where: { id: orderId },
                data: { status: 'RECEIVED' }
            });
            return created;
        });

        return NextResponse.json({ success: true, grn });
    } catch (error: any) {
        return errorResponse(error, 'Failed to create GRN');
    }
}
