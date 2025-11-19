import { prisma } from './prisma';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type ProductWithStockStatus = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  group?: string | null;
  quantity: number;
  minStock: number;
  status: StockStatus;
};

/**
 * Get stock status based on quantity and minimum stock threshold
 */
export function getStockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) {
    return 'OUT_OF_STOCK';
  } else if (quantity <= minStock) {
    return 'LOW_STOCK';
  } else {
    return 'IN_STOCK';
  }
}

/**
 * List products with stock status
 */
export async function listProductsWithStockStatus(query?: string, statusFilter?: StockStatus) {
  const where = query
    ? {
        OR: [
          { sku: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
          { group: { contains: query, mode: 'insensitive' } }
        ]
      }
    : {};

  const products = await prisma.product.findMany({
    where,
    include: { stocks: true },
    orderBy: [{ name: 'asc' }]
  });

  const productsWithStatus: ProductWithStockStatus[] = products.map(p => {
    const totalQuantity = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const minStock = p.minStockThreshold;
    const status = getStockStatus(totalQuantity, minStock);

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      group: p.group,
      quantity: totalQuantity,
      minStock,
      status
    };
  });

  // Filter by status if provided
  if (statusFilter) {
    return productsWithStatus.filter(p => p.status === statusFilter);
  }

  return productsWithStatus;
}

/**
 * Get stock statistics
 */
export async function getStockStatistics() {
  const products = await prisma.product.findMany({
    include: { stocks: true }
  });

  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;

  products.forEach(p => {
    const totalQuantity = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const status = getStockStatus(totalQuantity, p.minStockThreshold);
    
    if (status === 'OUT_OF_STOCK') outOfStock++;
    else if (status === 'LOW_STOCK') lowStock++;
    else inStock++;
  });

  return {
    total: products.length,
    inStock,
    lowStock,
    outOfStock
  };
}






