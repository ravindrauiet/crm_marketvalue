import { prisma } from '@/lib/prisma';
import { generateTallyXml } from '@/lib/tallyXmlGenerator';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: params.id },
            include: {
                customer: true,
                items: {
                    include: { product: true }
                }
            }
        });

        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Generate XML content
        const xmlContent = generateTallyXml({
            invoiceNumber: invoice.invoiceNumber,
            date: invoice.date,
            customerName: invoice.customer.company || invoice.customer.name,
            amount: invoice.totalAmount,
            items: invoice.items.map(item => ({
                productName: item.product.name,
                quantity: item.quantity,
                rate: item.unitPrice,
                amount: item.totalPrice
            }))
        });

        // Update status
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                isExportedToTally: true,
                tallyXmlContent: xmlContent // Cache it
            }
        });

        // Return XML response
        return new NextResponse(xmlContent, {
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="tally_voucher_${invoice.invoiceNumber}.xml"`
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
