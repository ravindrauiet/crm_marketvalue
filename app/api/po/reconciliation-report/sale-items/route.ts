import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/po/reconciliation-report/sale-items?from=YYYY-MM-DD&to=YYYY-MM-DD&search=
// Lists item-wise lines of the daily Tally sale invoices uploaded from the Fill Rate page.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = (searchParams.get('search') || '').toLowerCase().trim();

    const invoiceDate: { gte?: Date; lte?: Date } = {};
    if (from) invoiceDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) invoiceDate.lte = new Date(`${to}T23:59:59.999Z`);

    // Daily sale uploads are stored with notes "PO:<po> | Party:<party>"
    const bills = await prisma.purchaseBill.findMany({
      where: {
        notes: { startsWith: 'PO:' },
        ...(from || to ? { invoiceDate } : {}),
      },
      include: { items: true },
      orderBy: { invoiceDate: 'desc' },
    });

    const rows = bills.flatMap(b => {
      const poMatch = (b.notes || '').match(/^PO:([^|]*)/);
      const poNumber = poMatch ? poMatch[1].trim() : '';
      return b.items.map(item => ({
        id: item.id,
        invoiceDate: b.invoiceDate ? b.invoiceDate.toISOString().split('T')[0] : '',
        invoiceNumber: b.invoiceNumber || '',
        partyName: b.supplierName || '',
        poNumber,
        itemName: item.itemName,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        fileName: b.fileName || '',
      }));
    }).filter(r => !search ||
      r.invoiceNumber.toLowerCase().includes(search) ||
      r.partyName.toLowerCase().includes(search) ||
      r.poNumber.toLowerCase().includes(search) ||
      r.itemName.toLowerCase().includes(search)
    );

    return NextResponse.json({
      success: true,
      rows,
      totals: {
        invoices: new Set(rows.map(r => r.invoiceNumber)).size,
        lines: rows.length,
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        amount: rows.reduce((s, r) => s + r.amount, 0),
      },
    });
  } catch (err: any) {
    console.error('❌ [SALE ITEMS ERROR]', err);
    return NextResponse.json({ error: 'Failed to load sale invoice items: ' + err.message }, { status: 500 });
  }
}
