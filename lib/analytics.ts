import { prisma } from './prisma';

export async function getSalesAnalytics(startDate?: Date, endDate?: Date) {
  const where: any = {
    type: 'SALE',
    status: { not: 'CANCELLED' }
  };

  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) where.orderDate.gte = startDate;
    if (endDate) where.orderDate.lte = endDate;
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });

  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalOrders = orders.length;
  const totalItems = orders.reduce((sum, order) => 
    sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
  );

  // Group by product
  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      const key = item.productId;
      if (!productSales[key]) {
        productSales[key] = {
          name: item.product.name,
          quantity: 0,
          revenue: 0
        };
      }
      productSales[key].quantity += item.quantity;
      productSales[key].revenue += item.totalPrice;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalRevenue,
    totalOrders,
    totalItems,
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    topProducts
  };
}

export async function getStockAnalytics() {
  const products = await prisma.product.findMany({
    include: {
      stocks: true,
      orderItems: {
        include: {
          order: true
        }
      }
    }
  });

  const totalValue = products.reduce((sum, product) => {
    const stock = product.stocks.find(s => s.location === 'TOTAL');
    const quantity = stock?.quantity || 0;
    const cost = product.cost || 0;
    return sum + (quantity * cost);
  }, 0);

  const lowStockProducts = products.filter(product => {
    const stock = product.stocks.find(s => s.location === 'TOTAL');
    const quantity = stock?.quantity || 0;
    return quantity <= product.minStockThreshold;
  });

  return {
    totalValue,
    totalProducts: products.length,
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 10).map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      quantity: p.stocks.find(s => s.location === 'TOTAL')?.quantity || 0,
      minStock: p.minStockThreshold
    }))
  };
}

export async function getRecentActivity(limit = 20) {
  const [recentOrders, recentTransactions] = await Promise.all([
    prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        _count: { select: { items: true } }
      }
    }),
    prisma.stockTransaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: true
      }
    })
  ]);

  return {
    recentOrders,
    recentTransactions
  };
}

