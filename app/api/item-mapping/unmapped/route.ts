import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SALE_UPLOAD_WHERE, poNumberFromSaleNotes } from '@/lib/billSources';
import { cleanPoNumber } from '@/lib/poParsers';
import { normPo } from '@/lib/poDelivery';
import { bestPoItemIndex } from '@/lib/itemMatch';
import { makeMappingFinder } from '@/lib/mappingLookup';
import { inferBrand } from '@/lib/brands';

const nameKey = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Case pack written in Tally names: "Rice Idli Mix 30x500g" -> 30, "Gulab Jamun Tin 500g X 20pcs" -> 20
function casePackFromName(name: string): number | null {
  const m = name.match(/(?:^|[^\d.])(\d{1,3})\s*[x×*]\s*\d/i) || name.match(/[x×*]\s*(\d{1,3})\s*pcs/i);
  const n = m ? Number(m[1]) : NaN;
  return n > 1 ? n : null;
}

// GET /api/item-mapping/unmapped
// Chain items on current POs that have no item mapping, with a suggested Tally item taken from the
// Tally sale invoices billed against those POs, and company code / case size from another mapping
// of the same Tally item.
export async function GET() {
  try {
    const [pos, mappings, saleBills] = await Promise.all([
      prisma.chainPurchaseOrder.findMany({ where: { status: { not: 'REMOVED' } }, include: { items: true } }),
      prisma.itemMapping.findMany({ where: { isActive: true } }),
      prisma.purchaseBill.findMany({ where: SALE_UPLOAD_WHERE, select: { notes: true, items: { select: { itemName: true, quantity: true, rate: true, amount: true } } } }),
    ]);
    const findMapping = makeMappingFinder(mappings);
    const byTallyName = new Map(mappings.map(m => [nameKey(m.tallyItemName), m]));
    const billsByPo = new Map<string, typeof saleBills>();
    saleBills.forEach(b => {
      const k = normPo(poNumberFromSaleNotes(b.notes));
      if (k) billsByPo.set(k, [...(billsByPo.get(k) || []), b]);
    });

    type Entry = {
      chainName: string; chainItemCode: string; chainItemName: string; eanCode: string;
      poCount: number; totalPcs: number; lastPoDate: string; tallyVotes: Map<string, number>;
    };
    const unmapped = new Map<string, Entry>();

    for (const po of pos) {
      const chain = po.chainName.toUpperCase();
      const missing = po.items.map((item, idx) => ({ item, idx })).filter(({ item }) => !findMapping(chain, item.chainItemCode || '', item.eanCode || '', item.chainItemName || ''));
      if (!missing.length) continue;

      // Which Tally item was billed for each PO line (only lines of this PO compete)
      const forMatch = po.items.map(i => ({ chainItemName: i.chainItemName, tallyItemName: i.tallyItemName, unitPrice: i.unitPrice }));
      const billedName = new Map<number, string>();
      (billsByPo.get(normPo(cleanPoNumber(po.poNumber))) || []).forEach(b => b.items.forEach(bi => {
        const idx = bestPoItemIndex(forMatch, bi);
        if (idx !== -1 && !billedName.has(idx)) billedName.set(idx, bi.itemName);
      }));

      for (const { item, idx } of missing) {
        const key = `${chain}::${(item.chainItemCode || item.chainItemName).toLowerCase()}`;
        const e = unmapped.get(key) || {
          chainName: chain, chainItemCode: item.chainItemCode, chainItemName: item.chainItemName, eanCode: item.eanCode || '',
          poCount: 0, totalPcs: 0, lastPoDate: '', tallyVotes: new Map<string, number>(),
        };
        e.poCount++;
        e.totalPcs += item.quantityPcs;
        const d = po.poDate.toISOString().slice(0, 10);
        if (d > e.lastPoDate) e.lastPoDate = d;
        const tally = item.tallyItemName || billedName.get(idx);
        if (tally) e.tallyVotes.set(tally, (e.tallyVotes.get(tally) || 0) + 1);
        unmapped.set(key, e);
      }
    }

    const items = [...unmapped.values()].map(e => {
      const suggestedTally = [...e.tallyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const sibling = suggestedTally ? byTallyName.get(nameKey(suggestedTally)) : undefined;
      return {
        chainName: e.chainName, chainItemCode: e.chainItemCode, chainItemName: e.chainItemName, eanCode: e.eanCode,
        poCount: e.poCount, totalPcs: e.totalPcs, lastPoDate: e.lastPoDate,
        suggestion: {
          tallyItemName: suggestedTally,
          source: suggestedTally ? 'Billed in Tally against this item' : '',
          companyItemCode: sibling?.companyItemCode || '',
          companyItemName: sibling?.companyItemName || '',
          pcsPerCase: sibling?.pcsPerCase || (suggestedTally ? casePackFromName(suggestedTally) : null),
          brandName: sibling?.brandName || inferBrand(e.chainItemName, suggestedTally),
        },
      };
    }).sort((a, b) => b.poCount - a.poCount || b.lastPoDate.localeCompare(a.lastPoDate));

    const byChain: Record<string, number> = {};
    items.forEach(i => { byChain[i.chainName] = (byChain[i.chainName] || 0) + 1; });
    return NextResponse.json({ items, total: items.length, withSuggestion: items.filter(i => i.suggestion.tallyItemName).length, byChain });
  } catch (err: any) {
    console.error('❌ [UNMAPPED ITEMS ERROR]', err);
    return NextResponse.json({ error: 'Failed to list unmapped items: ' + err.message }, { status: 500 });
  }
}
