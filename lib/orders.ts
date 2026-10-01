import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ValidationError, isObjectId, requireValidDate, toNumber } from './validation';

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

export const ORDER_TYPES = ['PURCHASE', 'SALE'] as const;
export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'RECEIVED', 'CANCELLED'] as const;

type OrderItemInput = { productId: string; quantity: number; unitPrice: number };

/** Validates and normalises a create-order request body. Throws ValidationError on bad input. */
export function validateOrderInput(data: any): {
  type: 'PURCHASE' | 'SALE';
  customerId?: string;
  status: string;
  orderDate: Date;
  deliveryDate: Date | null;
  notes: string | null;
  items: OrderItemInput[];
} {
  if (!data || typeof data !== 'object') throw new ValidationError('Invalid request body');

  const type = String(data.type || '').toUpperCase();
  if (!ORDER_TYPES.includes(type as any)) throw new ValidationError('Order type must be PURCHASE or SALE');

  const status = data.status ? String(data.status).toUpperCase() : 'PENDING';
  if (!ORDER_STATUSES.includes(status as any) || status === 'CANCELLED') {
    throw new ValidationError(`Invalid order status "${data.status}"`);
  }

  const customerId = data.customerId ? String(data.customerId) : undefined;
  if (customerId && !isObjectId(customerId)) throw new ValidationError('Invalid customer id');

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new ValidationError('Please add at least one product');
  }

  const items = data.items.map((item: any, idx: number) => {
    const line = `Item ${idx + 1}`;
    const productId = String(item?.productId || '');
    const quantity = toNumber(item?.quantity);
    const unitPrice = toNumber(item?.unitPrice);
    if (!isObjectId(productId)) throw new ValidationError(`${line}: invalid product`);
    if (quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`${line}: quantity must be a whole number greater than 0`);
    }
    if (unitPrice === null || unitPrice < 0) throw new ValidationError(`${line}: unit price must be 0 or more`);
    return { productId, quantity, unitPrice };
  });

  const orderDate = requireValidDate(data.orderDate, 'Order date') || new Date();
  const deliveryDate = requireValidDate(data.deliveryDate, 'Delivery date');
  if (deliveryDate && deliveryDate < new Date(orderDate.getTime() - 24 * 3600 * 1000)) {
    throw new ValidationError('Delivery date cannot be before the order date');
  }

  return {
    type: type as 'PURCHASE' | 'SALE',
    customerId,
    status,
    orderDate,
    deliveryDate,
    notes: data.notes ? String(data.notes).slice(0, 2000) : null,
    items,
  };
}

/** Applies a stock change for one product inside a transaction and logs it */
async function applyStockChange(
  tx: Prisma.TransactionClient,
  productId: string,
  change: number,
  reason: string,
  reference: string,
  notes: string
) {
  const stock = await tx.stock.findFirst({ where: { productId, location: 'TOTAL' } })
    || await tx.stock.create({ data: { productId, location: 'TOTAL', quantity: 0 } });

  const previousQty = stock.quantity;
  const newQty = Math.max(0, previousQty + change);
  await tx.stock.update({ where: { id: stock.id }, data: { quantity: newQty } });
  await tx.stockTransaction.create({
    data: {
      productId,
      type: change >= 0 ? 'IN' : 'OUT',
      quantity: Math.abs(newQty - previousQty),
      previousQty,
      newQty,
      reason,
      reference,
      notes,
    }
  });
}

export async function createOrder(data: any) {
  const input = validateOrderInput(data);
  const orderNumber = data.orderNumber ? String(data.orderNumber).trim() : await generateOrderNumber(input.type);

  const totalAmount = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  // Total quantity per product (the same product may appear on several lines)
  const qtyByProduct = new Map<string, number>();
  for (const item of input.items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
  }

  return await prisma.$transaction(async tx => {
    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
      if (!customer) throw new ValidationError('Customer not found', 404);
    }

    const existing = await tx.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (existing) throw new ValidationError(`Order number ${orderNumber} already exists`, 409);

    // Validate products exist, and for SALES that the combined quantity is in stock
    for (const [productId, qty] of qtyByProduct) {
      const product = await tx.product.findUnique({ where: { id: productId }, include: { stocks: true } });
      if (!product) throw new ValidationError(`Product not found: ${productId}`, 404);

      if (input.type === 'SALE') {
        const currentStock = product.stocks.find(s => s.location === 'TOTAL')?.quantity || 0;
        if (currentStock < qty) {
          throw new ValidationError(`Insufficient stock for product "${product.name}". Available: ${currentStock}, Requested: ${qty}`);
        }
      }
    }

    const order = await tx.order.create({
      data: {
        orderNumber,
        type: input.type,
        customerId: input.customerId,
        status: input.status,
        orderDate: input.orderDate,
        deliveryDate: input.deliveryDate,
        totalAmount,
        notes: input.notes,
        items: {
          create: input.items.map(item => ({
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
    for (const [productId, qty] of qtyByProduct) {
      await applyStockChange(
        tx,
        productId,
        input.type === 'PURCHASE' ? qty : -qty,
        input.type,
        order.id,
        `Order ${order.orderNumber}`
      );
    }

    return order;
  }, { timeout: 30000 });
}

export async function updateOrderStatus(id: string, status: string) {
  if (!isObjectId(id)) throw new ValidationError('Invalid order id');
  const newStatus = String(status || '').toUpperCase();
  if (!ORDER_STATUSES.includes(newStatus as any)) {
    throw new ValidationError(`Invalid status "${status}". Allowed: ${ORDER_STATUSES.join(', ')}`);
  }

  return await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new ValidationError('Order not found', 404);
    if (order.status === 'CANCELLED' && newStatus !== 'CANCELLED') {
      throw new ValidationError('A cancelled order cannot be re-opened. Please create a new order.');
    }

    // Cancelling reverses the stock movement made when the order was created
    if (newStatus === 'CANCELLED' && order.status !== 'CANCELLED') {
      for (const item of order.items) {
        await applyStockChange(
          tx,
          item.productId,
          order.type === 'PURCHASE' ? -item.quantity : item.quantity,
          'ORDER_CANCELLED',
          order.id,
          `Cancelled order ${order.orderNumber}`
        );
      }
    }

    return await tx.order.update({
      where: { id },
      data: { status: newStatus }
    });
  }, { timeout: 30000 });
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





