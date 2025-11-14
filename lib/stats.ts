import { prisma } from './prisma';
import { getStockStatistics } from './stockStatus';

export async function getDashboardStats() {
  const [recordsCount, productsCount, stockAgg, stockStats] = await Promise.all([
    prisma.record.count(),
    prisma.product.count(),
    prisma.stock.aggregate({ _sum: { quantity: true } }),
    getStockStatistics()
  ]);
  return {
    records: recordsCount,
    products: productsCount,
    totalStock: stockAgg._sum.quantity ?? 0,
    inStock: stockStats.inStock,
    lowStock: stockStats.lowStock,
    outOfStock: stockStats.outOfStock
  };
}





