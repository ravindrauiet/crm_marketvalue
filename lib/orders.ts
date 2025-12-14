import { prisma } from './prisma';

export async function listOrders(filters?: {
  type?: 'PURCHASE' | 'SALE';
  status?: string;
  customerId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const where: any = {};

  if (filters?.type) where.type = filters.type;
  if (filters?.status) where.status = filters.status;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.startDate || filters?.endDate) {
    where.orderDate = {};
    if (filters.startDate) where.orderDate.gte = filters.startDate;
    if (filters.endDate) where.orderDate.lte = filters.endDate;
  }

  return await prisma.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true
        }
      },
      _count: {
        select: { items: true }
      }
    },
    orderBy: { orderDate: 'desc' }
  });
}

export async function getOrder(id: string) {
  return await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: true
        }
      }
    }
  });
}

export async function createOrder(data: {
  orderNumber: string;
  type: 'PURCHASE' | 'SALE';
  customerId?: string;
  status?: string;
  orderDate?: Date;
  deliveryDate?: Date;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
}) {
  const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  // VALIDATION: Check stock availability for SALES before proceeding
  if (data.type === 'SALE') {
    for (const item of data.items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { stocks: true }
      });

      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const currentStock = product.stocks.find(s => s.location === 'TOTAL')?.quantity || 0;
      if (currentStock < item.quantity) {
        throw new Error(`Insufficient stock for product "${product.name}". Available: ${currentStock}, Requested: ${item.quantity}`);
      }
    }
  }

  const order = await prisma.order.create({
    data: {
      orderNumber: data.orderNumber,
      type: data.type,
      customerId: data.customerId,
      status: data.status || 'PENDING',
      orderDate: data.orderDate || new Date(),
      deliveryDate: data.deliveryDate,
      totalAmount,
      notes: data.notes,
      items: {
        create: data.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice
        }))
      }
    },
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });

  // Update stock and create transactions
  for (const item of data.items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { stocks: true }
    });

    if (product) {
      const stock = product.stocks.find(s => s.location === 'TOTAL') ||
        await prisma.stock.create({
          data: {
            productId: item.productId,
            location: 'TOTAL',
            quantity: 0
          }
        });

      const previousQty = stock.quantity;
      const quantityChange = data.type === 'PURCHASE' ? item.quantity : -item.quantity;
      const newQty = Math.max(0, previousQty + quantityChange);

      await prisma.stock.update({
        where: { id: stock.id },
        data: { quantity: newQty }
      });

      await prisma.stockTransaction.create({
        data: {
          productId: item.productId,
          type: data.type === 'PURCHASE' ? 'IN' : 'OUT',
          quantity: Math.abs(quantityChange),
          previousQty,
          newQty,
          reason: data.type,
          reference: order.id,
          notes: `Order ${order.orderNumber}`
        }
      });
    }
  }

  return order;
}

export async function updateOrderStatus(id: string, status: string) {
  return await prisma.order.update({
    where: { id },
    data: { status }
  });
}

export async function generateOrderNumber(type: 'PURCHASE' | 'SALE'): Promise<string> {
  const prefix = type === 'PURCHASE' ? 'PO' : 'SO';
  const year = new Date().getFullYear();

  const lastOrder = await prisma.order.findFirst({
    where: {
      orderNumber: {
        startsWith: `${prefix}-${year}-`
      }
    },
    orderBy: { orderNumber: 'desc' }
  });

  let nextNum = 1;
  if (lastOrder) {
    const match = lastOrder.orderNumber.match(/\d+$/);
    if (match) {
      nextNum = parseInt(match[0]) + 1;
    }
  }

  return `${prefix}-${year}-${String(nextNum).padStart(5, '0')}`;
}





