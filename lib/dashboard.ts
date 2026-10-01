import { prisma } from './prisma';
import { getStockStatistics } from './stockStatus';
import { OCR_BILL_WHERE, SALE_UPLOAD_WHERE } from './billSources';

const CLOSED_PO_STATUSES = ['REMOVED', 'CLOSED', 'PO CLOSED', 'CANCELLED', 'COMPLETED', 'DELIVERED'];

/** Short display name for a chain party, e.g. "Flipkart India Private Limited" -> "Flipkart India" */
function shortParty(name: string) {
  return name
    .replace(/\b(private|pvt\.?|limited|ltd\.?|llp|india)\b/gi, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || name;
}

export async function getDashboardData() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  // Sales figures use the most recent month that has uploaded Tally sale data
  const latestSale = await prisma.purchaseBill.findFirst({
    where: SALE_UPLOAD_WHERE,
    orderBy: { invoiceDate: 'desc' },
    select: { invoiceDate: true },
  });
  const salesRef = latestSale?.invoiceDate || now;
  const monthStart = new Date(Date.UTC(salesRef.getUTCFullYear(), salesRef.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(salesRef.getUTCFullYear(), salesRef.getUTCMonth() + 1, 1));

  const openPoWhere = { status: { notIn: CLOSED_PO_STATUSES } };

  const [
    monthSales, openPoAgg, recentPos, duePos, recoGroups, billsToReview, stockStats, productsCount,
  ] = await Promise.all([
    prisma.purchaseBill.findMany({
      where: { AND: [SALE_UPLOAD_WHERE, { invoiceDate: { gte: monthStart, lt: monthEnd } }] },
      select: { supplierName: true, totalAmount: true },
    }),
    prisma.chainPurchaseOrder.aggregate({ where: openPoWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.chainPurchaseOrder.findMany({
      where: { status: { not: 'REMOVED' } },
      orderBy: { poDate: 'desc' },
      take: 8,
      select: { id: true, poNumber: true, chainName: true, poDate: true, appointmentDate: true, deliveryDate: true, totalAmount: true, status: true },
    }),
    prisma.chainPurchaseOrder.count({
      where: { ...openPoWhere, OR: [{ deliveryDate: { gte: now, lte: in7Days } }, { appointmentDate: { gte: now, lte: in7Days } }] },
    }),
    prisma.paymentReco.groupBy({ by: ['matchStatus'], _count: { _all: true }, _sum: { pendingAmount: true, creditAmount: true } }),
    prisma.purchaseBill.groupBy({
      by: ['status'],
      where: { AND: [OCR_BILL_WHERE, { status: { in: ['PENDING', 'EXTRACTED', 'DUPLICATE', 'FAILED'] } }] },
      _count: { _all: true },
    }),
    getStockStatistics(),
    prisma.product.count(),
  ]);

  // Sales by chain (party) for the month, top 6 + Other
  const byParty = new Map<string, number>();
  for (const b of monthSales) {
    const key = shortParty(b.supplierName || 'Unknown');
    byParty.set(key, (byParty.get(key) || 0) + (b.totalAmount || 0));
  }
  const sortedParties = [...byParty.entries()].sort((a, b) => b[1] - a[1]);
  const topParties = sortedParties.slice(0, 6).map(([label, value]) => ({ label, value }));
  const otherValue = sortedParties.slice(6).reduce((s, [, v]) => s + v, 0);
  if (otherValue > 0) topParties.push({ label: `Other (${sortedParties.length - 6})`, value: otherValue });

  const recoPending = recoGroups.filter(g => g.matchStatus !== 'MATCHED').reduce((s, g) => s + (g._sum.pendingAmount || 0), 0);
  const recoUnmatched = recoGroups.find(g => g.matchStatus === 'UNMATCHED')?._count._all || 0;
  const billCount = (s: string) => billsToReview.find(b => b.status === s)?._count._all || 0;

  return {
    salesMonthLabel: monthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    salesValue: monthSales.reduce((s, b) => s + (b.totalAmount || 0), 0),
    salesInvoices: monthSales.length,
    salesByParty: topParties,
    openPoCount: openPoAgg._count._all,
    openPoValue: openPoAgg._sum.totalAmount || 0,
    duePos,
    recentPos,
    recoPending,
    recoUnmatched,
    billsAwaitingReview: billCount('EXTRACTED') + billCount('PENDING'),
    billsFailed: billCount('FAILED'),
    billsDuplicate: billCount('DUPLICATE'),
    productsCount,
    lowStock: stockStats.lowStock,
    outOfStock: stockStats.outOfStock,
  };
}

export function formatINR(n: number, compact = false) {
  if (compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  }
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
