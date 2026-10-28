// Which Tally sale-invoice lines belong to which PO item. Shared by the Fill Rate report
// (delivered quantities) and the Shortfall planner (quantity still to deliver).
import { bestPoItemIndex, PoItemForMatch } from './itemMatch';

type BilledLine = { itemName: string; tallyItemName?: string | null; quantity: number; rate: number; amount: number };

/** "PO#P3960925" / "PO P3960925" -> "p3960925" */
export const normPo = (s: string | null | undefined) => (s || '').replace(/^\s*po\s*[#:.-]?\s*/i, '').trim().toLowerCase();

export function assignBilledLines(poItems: PoItemForMatch[], bills: Array<{ items: BilledLine[] }>) {
  const byItem = poItems.map(() => ({ qty: 0, amount: 0 }));
  const unmatched = new Map<string, { qty: number; amount: number }>();
  bills.forEach(b => b.items.forEach(bi => {
    const amount = bi.amount || (bi.quantity || 0) * (bi.rate || 0);
    const idx = bestPoItemIndex(poItems, bi);
    const slot = idx === -1 ? (unmatched.get(bi.itemName) || { qty: 0, amount: 0 }) : byItem[idx];
    slot.qty += bi.quantity || 0;
    slot.amount += amount;
    if (idx === -1) unmatched.set(bi.itemName, slot);
  }));
  return { byItem, unmatched };
}
