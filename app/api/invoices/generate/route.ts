import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json();

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
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

        // Check status
        if (order.type !== 'SALE' || !['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
            // We allow draft invoices for PENDING orders too if needed, but usually only confirmed
            // For now, let's allow it but warn.
        }

        // Generate Invoice Number (Simple logic: INV-{YYYY}-{Count})
        const count = await prisma.invoice.count();
        const year = new Date().getFullYear();
        const invoiceNumber = `INV-${year}-${(count + 1).toString().padStart(4, '0')}`;

        // Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber,
                date: new Date(),
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30 default
                status: 'DRAFT',
                totalAmount: order.totalAmount,
                orderId: order.id,
                customerId: order.customerId!,
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
