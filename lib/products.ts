import { prisma } from './prisma';
import { listProductsWithStockStatus, ProductWithStockStatus } from './stockStatus';

export type ProductListItem = ProductWithStockStatus;

export async function listProducts(query?: string, statusFilter?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') {
  return await listProductsWithStockStatus(query, statusFilter);
}





