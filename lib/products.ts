import { prisma } from './prisma';

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  group?: string | null;
  quantity: number;
};

export async function listProducts(query?: string) {
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

  return products.map(p => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    group: p.group,
    quantity: p.stocks.reduce((sum, s) => sum + s.quantity, 0)
  })) as ProductListItem[];
}




