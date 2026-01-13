import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const where: any = {};
        if (status) where.status = status;

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                customer: { select: { name: true, company: true } },
                _count: { select: { items: true } }
            },
            orderBy: { date: 'desc' }
        });

        return NextResponse.json(invoices);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
