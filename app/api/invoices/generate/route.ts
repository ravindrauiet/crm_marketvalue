import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { isObjectId, nextSequenceNumber } from '@/lib/validation';

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json().catch(() => ({}));

        if (!isObjectId(orderId)) {
            return NextResponse.json({ error: 'A valid Order ID is required' }, { status: 400 });
        }

        // Fetch order with items and customer
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: true,
                items: {
                    include: { product: true }
                }
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Check if order is already invoiced (optional logic, skipping for flexibility or checking existing relation)
        const existingInvoice = await prisma.invoice.findFirst({
            where: { orderId: orderId }
        });

        if (existingInvoice) {
            return NextResponse.json({ error: 'Invoice already exists for this order', invoice: existingInvoice }, { status: 409 });
        }

        if (order.type !== 'SALE') {
            return NextResponse.json({ error: 'Invoices can only be generated for SALE orders' }, { status: 400 });
        }
        if (order.status === 'CANCELLED') {
            return NextResponse.json({ error: 'Cannot invoice a cancelled order' }, { status: 400 });
        }
        if (!order.customerId) {
            return NextResponse.json({ error: 'This order has no customer. Please assign a customer before generating an invoice.' }, { status: 400 });
        }
        if (order.items.length === 0) {
            return NextResponse.json({ error: 'This order has no items' }, { status: 400 });
        }

        // Next number after the highest existing one (a count breaks after deletes)
        const invoiceNumber = await nextSequenceNumber('INV', async prefix =>
            (await prisma.invoice.findMany({ where: { invoiceNumber: { startsWith: prefix } }, select: { invoiceNumber: true } }))
                .map(i => i.invoiceNumber)
        );

        // Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber,
                date: new Date(),
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30 default
                status: 'DRAFT',
                totalAmount: order.totalAmount,
                orderId: order.id,
                customerId: order.customerId,
                items: {
                    create: order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                        description: item.product.name
                    }))
                }
            }
        });

        return NextResponse.json({ success: true, invoice });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
