import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isObjectId } from '@/lib/validation';
import { SALE_UPLOAD_WHERE, poNumberFromSaleNotes } from '@/lib/billSources';
import { cleanPoNumber } from '@/lib/poParsers';
import { assignBilledLines, normPo } from '@/lib/poDelivery';
import { makeMappingFinder } from '@/lib/mappingLookup';

// Tally names carry stray double spaces ("Hing)  120 x 50g"); compare on a normalised key
const nameKey = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

export type ShortfallStatus = 'SHORT' | 'OK' | 'DELIVERED' | 'NOT_MAPPED' | 'NO_STOCK_RECORD';

// POST /api/shortfall
// Body: { poIds: string[] }
// Per PO line: quantity still to deliver (ordered − already billed in Tally), stock allocated to it
// (most urgent PO first) and the shortfall to order from the company, plus the same shortfall
// combined per company item for the order sheet.
export async function POST(req: NextRequest) {
  try {
    const { poIds } = await req.json().catch(() => ({}));
    if (!Array.isArray(poIds) || poIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one PO' }, { status: 400 });
    }
    if (!poIds.every(isObjectId)) {
      return NextResponse.json({ error: 'poIds contains an invalid id' }, { status: 400 });
    }

    // Most urgent first (appointment, else expiry, else PO date) so stock goes to the earliest delivery
    const dueOf = (po: { appointmentDate: Date | null; deliveryDate: Date | null; poDate: Date }) => po.appointmentDate || po.deliveryDate || po.poDate;
    const pos = (await prisma.chainPurchaseOrder.findMany({ where: { id: { in: poIds } }, include: { items: true } }))
      .sort((a, b) => dueOf(a).getTime() - dueOf(b).getTime());

    const [mappings, products, stockRows, saleBills] = await Promise.all([
      prisma.itemMapping.findMany({ where: { isActive: true } }),
      prisma.product.findMany({ select: { name: true, sku: true, stocks: { select: { quantity: true, location: true } } } }),
      prisma.stock.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
      prisma.purchaseBill.findMany({
        where: { AND: [SALE_UPLOAD_WHERE, { OR: pos.map(po => ({ notes: { startsWith: `PO:${cleanPoNumber(po.poNumber)}` } })) }] },
        include: { items: true },
      }),
    ]);

    const findMapping = makeMappingFinder(mappings);

    const stockByKey = new Map<string, { qty: number; locations: string }>();
    products.forEach(p => {
      const entry = {
        qty: p.stocks.reduce((s, st) => s + st.quantity, 0),
        locations: [...new Set(p.stocks.map(st => st.location).filter(Boolean))].join(', '),
      };
      [p.name, p.sku].forEach(k => { if (k) stockByKey.set(nameKey(k), entry); });
    });

    const billsByPo = new Map<string, typeof saleBills>();
    saleBills.forEach(b => {
      const k = normPo(poNumberFromSaleNotes(b.notes));
      if (k) billsByPo.set(k, [...(billsByPo.get(k) || []), b]);
    });

    const remaining = new Map<string, number>(); // stock left after earlier lines took theirs
    const shortfallItems = pos.flatMap(po => {
      const chain = po.chainName.toUpperCase();
      const lines = po.items.map(item => {
        const mapping = findMapping(chain, item.chainItemCode || '', item.eanCode || '', item.chainItemName || '');
        return { item, mapping, tallyItemName: mapping?.tallyItemName || item.tallyItemName || '' };
      });
      const { byItem: delivered } = assignBilledLines(
        lines.map(l => ({ chainItemName: l.item.chainItemName, tallyItemName: l.tallyItemName, unitPrice: l.item.unitPrice })),
        billsByPo.get(normPo(cleanPoNumber(po.poNumber))) || [],
      );

      return lines.map(({ item, mapping, tallyItemName }, idx) => {
        const pcsPerCase = mapping?.pcsPerCase && mapping.pcsPerCase > 0 ? mapping.pcsPerCase : 1;
        const deliveredPcs = Math.round(delivered[idx].qty);
        const reqPcs = Math.max(0, item.quantityPcs - deliveredPcs);
        const key = nameKey(tallyItemName);
        const stock = key ? stockByKey.get(key) : undefined;
        if (key && stock && !remaining.has(key)) remaining.set(key, stock.qty);
        const availableStock = key && stock ? Math.max(0, remaining.get(key)!) : 0;

        let status: ShortfallStatus;
        let shortfallPcs = 0;
        if (reqPcs === 0) status = 'DELIVERED';
        else if (!tallyItemName) { status = 'NOT_MAPPED'; shortfallPcs = reqPcs; }
        else if (!stock) { status = 'NO_STOCK_RECORD'; shortfallPcs = reqPcs; }
        else {
          shortfallPcs = Math.max(0, reqPcs - availableStock);
          status = shortfallPcs > 0 ? 'SHORT' : 'OK';
          // Reserve what this line uses so the same stock isn't offered to the next PO
          remaining.set(key, Math.max(0, availableStock - reqPcs));
        }

        return {
          poId: po.id,
          chainItemCode: item.chainItemCode,
          chainItemName: item.chainItemName,
          chainName: chain,
          brandName: mapping?.brandName || '',
          tallyItemName,
          eanCode: item.eanCode || mapping?.eanCode || '',
          companyItemCode: mapping?.companyItemCode || '',
          companyItemName: mapping?.companyItemName || '',
          pcsPerCase,
          caseSizeKnown: !!mapping?.pcsPerCase && mapping.pcsPerCase > 1,
          orderedPcs: item.quantityPcs,
          deliveredPcs,
          reqPcs,
          reqCase: reqPcs / pcsPerCase,
          availableStock,
          totalStock: stock?.qty ?? 0,
          shortfallPcs,
          // Whole cases only, rounded up so the order covers the shortfall
          shortfallCases: Math.ceil(shortfallPcs / pcsPerCase),
          status,
          sourcePo: cleanPoNumber(po.poNumber),
          appointmentDate: po.appointmentDate ? po.appointmentDate.toISOString() : null,
          dueDate: dueOf(po).toISOString(),
          location: stock?.locations || '',
        };
      });
    });

    // Company order: one line per company item (or Tally item), cases rounded up on the combined shortfall
    const orderMap = new Map<string, any>();
    shortfallItems.filter(i => i.status === 'SHORT' || i.status === 'NO_STOCK_RECORD').forEach(i => {
      const key = (i.companyItemCode || i.tallyItemName).toLowerCase();
      const o = orderMap.get(key) || {
        companyItemCode: i.companyItemCode, companyItemName: i.companyItemName, tallyItemName: i.tallyItemName,
        brandName: i.brandName, eanCode: i.eanCode, pcsPerCase: i.pcsPerCase, caseSizeKnown: i.caseSizeKnown,
        shortfallPcs: 0, sourcePos: new Set<string>(), earliestDue: i.dueDate,
      };
      o.shortfallPcs += i.shortfallPcs;
      o.sourcePos.add(i.sourcePo);
      if (i.dueDate < o.earliestDue) o.earliestDue = i.dueDate;
      orderMap.set(key, o);
    });
    const orderLines = [...orderMap.values()]
      .map(o => ({ ...o, orderCases: Math.ceil(o.shortfallPcs / o.pcsPerCase), sourcePos: [...o.sourcePos] }))
      .sort((a, b) => a.earliestDue.localeCompare(b.earliestDue) || a.tallyItemName.localeCompare(b.tallyItemName));

    const count = (s: ShortfallStatus) => shortfallItems.filter(i => i.status === s).length;
    return NextResponse.json({
      shortfallItems,
      orderLines,
      poCount: pos.length,
      totalItems: shortfallItems.length,
      itemsWithShortfall: count('SHORT') + count('NO_STOCK_RECORD'),
      counts: { SHORT: count('SHORT'), OK: count('OK'), DELIVERED: count('DELIVERED'), NOT_MAPPED: count('NOT_MAPPED'), NO_STOCK_RECORD: count('NO_STOCK_RECORD') },
      stock: { loaded: stockRows._count._all > 0, lastUpdated: stockRows._max.updatedAt },
    });
  } catch (err) {
    console.error('❌ [SHORTFALL ERROR]', err);
    return NextResponse.json({ error: 'Failed to calculate shortfall' }, { status: 500 });
  }
}
