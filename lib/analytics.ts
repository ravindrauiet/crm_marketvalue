import { prisma } from './prisma';
import { getStockStatus } from './stockStatus';
import { SALE_UPLOAD_WHERE } from './billSources';
import { shortParty } from './dashboard';

/** "2026-07" -> UTC [start, end) of that month, or null when not a valid month key */
function monthRange(key: string) {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  if (mo < 0 || mo > 11) return null;
  return { start: new Date(Date.UTC(y, mo, 1)), end: new Date(Date.UTC(y, mo + 1, 1)) };
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  const r = monthRange(key);
  return r ? r.start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : key;
}

/**
 * Sales come from the daily Tally sale-invoice uploads (Fill Rate page), the same source as the dashboard.
 * `month` is "YYYY-MM", "latest" (newest month with data) or "all"; anything else falls back to all time.
 */
export async function getSalesAnalytics(month = 'all') {
  const bills = await prisma.purchaseBill.findMany({
    where: SALE_UPLOAD_WHERE,
    select: {
      invoiceDate: true,
      totalAmount: true,
      supplierName: true,
      items: { select: { itemName: true, tallyItemName: true, quantity: true, amount: true } },
    },
  });

  // Monthly trend always covers every month with data, so it doubles as the period picker
  const byMonth = new Map<string, { value: number; invoices: number }>();
  for (const b of bills) {
    if (!b.invoiceDate) continue;
    const k = monthKey(b.invoiceDate);
    const m = byMonth.get(k) || { value: 0, invoices: 0 };
    m.value += b.totalAmount || 0;
    m.invoices++;
    byMonth.set(k, m);
  }
  const monthly = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, m]) => ({ key, label: monthLabel(key), ...m }));

  if (month === 'latest') month = monthly.length ? monthly[monthly.length - 1].key : 'all';
  const range = month === 'all' ? null : monthRange(month);
  const inPeriod = range
    ? bills.filter(b => b.invoiceDate && b.invoiceDate >= range.start && b.invoiceDate < range.end)
    : bills;

  const byParty = new Map<string, number>();
  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  let totalUnits = 0;
  for (const b of inPeriod) {
    const party = shortParty(b.supplierName || 'Unknown');
    byParty.set(party, (byParty.get(party) || 0) + (b.totalAmount || 0));
    for (const it of b.items) {
      const name = (it.tallyItemName || it.itemName || 'Unknown item').trim();
      const p = byProduct.get(name) || { name, quantity: 0, revenue: 0 };
      p.quantity += it.quantity || 0;
      p.revenue += it.amount || 0;
      byProduct.set(name, p);
      totalUnits += it.quantity || 0;
    }
  }

  const totalRevenue = inPeriod.reduce((s, b) => s + (b.totalAmount || 0), 0);
  return {
    period: range ? month : 'all',
    periodLabel: range ? monthLabel(month) : 'All time',
    totalRevenue,
    totalInvoices: inPeriod.length,
    totalUnits,
    averageInvoiceValue: inPeriod.length ? totalRevenue / inPeriod.length : 0,
    chainCount: byParty.size,
    monthly,
    byChain: [...byParty.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}

export async function getStockAnalytics() {
  const products = await prisma.product.findMany({ include: { stocks: true }, orderBy: { name: 'asc' } });

  let totalValue = 0;
  let missingCost = 0;
  let inStock = 0;
  const alerts: Array<{ id: string; sku: string; name: string; quantity: number; minStock: number; status: 'LOW_STOCK' | 'OUT_OF_STOCK' }> = [];

  for (const p of products) {
    // Same rule as the Products page: stock is summed across all locations
    const quantity = p.stocks.reduce((s, st) => s + st.quantity, 0);
    if (p.cost) totalValue += quantity * p.cost;
    else missingCost++;
    const status = getStockStatus(quantity, p.minStockThreshold);
    if (status === 'IN_STOCK') inStock++;
    else alerts.push({ id: p.id, sku: p.sku, name: p.name, quantity, minStock: p.minStockThreshold, status });
  }

  // Out of stock first, then the lowest quantities
  alerts.sort((a, b) => (a.status === b.status ? a.quantity - b.quantity : a.status === 'OUT_OF_STOCK' ? -1 : 1));

  return {
    totalValue,
    totalProducts: products.length,
    missingCost,
    inStock,
    lowStock: alerts.filter(a => a.status === 'LOW_STOCK').length,
    outOfStock: alerts.filter(a => a.status === 'OUT_OF_STOCK').length,
    alerts: alerts.slice(0, 10),
  };
}

export async function getRecentActivity(limit = 12) {
  const recentTransactions = await prisma.stockTransaction.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, type: true, quantity: true, previousQty: true, newQty: true, reason: true, notes: true, createdAt: true,
      product: { select: { name: true, sku: true } },
    },
  });
  return { recentTransactions };
}

export async function getAnalytics(month = 'all') {
  const [sales, stock, activity] = await Promise.all([getSalesAnalytics(month), getStockAnalytics(), getRecentActivity()]);
  return { sales, stock, activity };
}
