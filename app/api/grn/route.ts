import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

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
        const body = await request.json();
        const { orderId, note, items } = body;

        if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

        const count = await prisma.grn.count();
        const year = new Date().getFullYear();
        const grnNumber = `GRN-${year}-${(count + 1).toString().padStart(4, '0')}`;

        const grn = await prisma.grn.create({
            data: {
                grnNumber,
                receivedDate: new Date(),
                orderId,
                note,
                items: {
                    create: items.map((item: any) => ({
                        productId: item.productId,
                        quantityReceived: parseInt(item.quantityReceived),
                        quantityRejected: parseInt(item.quantityRejected || 0),
                        rejectionReason: item.rejectionReason
                    }))
                }
            }
        });

        // Update order status if needed (e.g. to RECEIVED or PARTIALLY_RECEIVED)
        // For simplicity, let's mark as RECEIVED
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'RECEIVED' }
        });

        return NextResponse.json({ success: true, grn });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
