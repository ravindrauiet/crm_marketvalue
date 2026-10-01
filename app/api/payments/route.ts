import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { ValidationError, cleanString, errorResponse, isObjectId, nextSequenceNumber, requireValidDate, toNumber } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const PAYMENT_TYPES = ['INCOMING', 'OUTGOING'];
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER'];

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
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');

        const amount = toNumber(body.amount);
        const method = cleanString(body.method, 30).toUpperCase();
        const type = cleanString(body.type, 20).toUpperCase();
        const date = requireValidDate(body.date, 'Payment date') || new Date();
        const invoiceId = body.invoiceId ? String(body.invoiceId) : null;
        const customerId = body.customerId ? String(body.customerId) : null;

        if (amount === null || amount <= 0) throw new ValidationError('Amount must be a number greater than 0');
        if (!PAYMENT_METHODS.includes(method)) throw new ValidationError(`Method must be one of: ${PAYMENT_METHODS.join(', ')}`);
        if (!PAYMENT_TYPES.includes(type)) throw new ValidationError('Type must be INCOMING or OUTGOING');
        if (invoiceId && !isObjectId(invoiceId)) throw new ValidationError('Invalid invoice id');
        if (customerId && !isObjectId(customerId)) throw new ValidationError('Invalid customer id');

        if (invoiceId) {
            const exists = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
            if (!exists) throw new ValidationError('Invoice not found', 404);
        }
        if (customerId) {
            const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
            if (!exists) throw new ValidationError('Customer not found', 404);
        }

        const paymentNumber = await nextSequenceNumber('PAY', async prefix =>
            (await prisma.payment.findMany({ where: { paymentNumber: { startsWith: prefix } }, select: { paymentNumber: true } }))
                .map(p => p.paymentNumber)
        );

        const payment = await prisma.payment.create({
            data: {
                paymentNumber,
                date,
                amount,
                method,
                reference: cleanString(body.reference, 100) || null,
                type,
                invoiceId,
                customerId,
                notes: cleanString(body.notes, 1000) || null
            }
        });

        // If linked to invoice, update invoice status from the sum of its payments
        if (invoiceId) {
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: { payments: true }
            });

            if (invoice) {
                // invoice.payments already includes the payment created above
                const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
                let newStatus = invoice.status;
                if (totalPaid >= invoice.totalAmount - 0.01) {
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
        return errorResponse(error, 'Failed to save payment');
    }
}
