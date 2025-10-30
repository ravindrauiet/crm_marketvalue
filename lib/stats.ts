import { prisma } from './prisma';

export async function getDashboardStats() {
  const [recordsCount, productsCount, stockAgg] = await Promise.all([
    prisma.record.count(),
    prisma.product.count(),
    prisma.stock.aggregate({ _sum: { quantity: true } })
  ]);
  return {
    records: recordsCount,
    products: productsCount,
    totalStock: stockAgg._sum.quantity ?? 0
  };
}


