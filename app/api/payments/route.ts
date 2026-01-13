import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const payments = await prisma.payment.findMany({
            include: {
                customer: { select: { name: true, company: true } },
                invoice: { select: { invoiceNumber: true } }
            },
            orderBy: { date: 'desc' }
        });
        return NextResponse.json(payments);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, amount, method, reference, type, invoiceId, customerId, notes } = body;

        if (!amount || !method || !type) {
            return NextResponse.json({ error: 'Amount, Method and Type are required' }, { status: 400 });
        }

        const count = await prisma.payment.count();
        const year = new Date().getFullYear();
        const paymentNumber = `PAY-${year}-${(count + 1).toString().padStart(4, '0')}`;

        const payment = await prisma.payment.create({
            data: {
                paymentNumber,
                date: date ? new Date(date) : new Date(),
                amount: parseFloat(amount),
                method,
                reference,
                type, // INCOMING, OUTGOING
                invoiceId: invoiceId || null,
                customerId: customerId || null,
                notes
            }
        });

        // If linked to invoice, update invoice status (simple logic)
        if (invoiceId) {
            // Fetch invoice total and payments
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: { payments: true }
            });

            if (invoice) {
                const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0) + payment.amount;
                let newStatus = invoice.status;
                if (totalPaid >= invoice.totalAmount) {
                    newStatus = 'PAID';
                } else if (totalPaid > 0) {
                    newStatus = 'PARTIALLY_PAID';
                }

                if (newStatus !== invoice.status) {
                    await prisma.invoice.update({
                        where: { id: invoiceId },
                        data: { status: newStatus }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, payment });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
