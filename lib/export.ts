import * as XLSX from 'xlsx';
import { prisma } from './prisma';

export async function exportProductsToExcel() {
  const products = await prisma.product.findMany({
    include: {
      stocks: true
    },
    orderBy: { name: 'asc' }
  });

  const data = products.map(p => {
    const stock = p.stocks.find(s => s.location === 'TOTAL');
    return {
      'SKU': p.sku,
      'Product Name': p.name,
      'Brand': p.brand || '',
      'Group': p.group || '',
      'Description': p.description || '',
      'Price': p.price || 0,
      'Cost': p.cost || 0,
      'Quantity': stock?.quantity || 0,
      'Min Stock': p.minStockThreshold,
      'Status': stock && stock.quantity <= p.minStockThreshold 
        ? (stock.quantity === 0 ? 'Out of Stock' : 'Low Stock')
        : 'In Stock'
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function exportOrdersToExcel(type?: 'PURCHASE' | 'SALE', startDate?: Date, endDate?: Date) {
  const where: any = {};
  if (type) where.type = type;
  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) where.orderDate.gte = startDate;
    if (endDate) where.orderDate.lte = endDate;
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: { orderDate: 'desc' }
  });

  const data = orders.map(order => ({
    'Order Number': order.orderNumber,
    'Type': order.type,
    'Customer': order.customer?.name || order.customer?.company || '',
    'Status': order.status,
    'Order Date': order.orderDate.toISOString().split('T')[0],
    'Delivery Date': order.deliveryDate ? order.deliveryDate.toISOString().split('T')[0] : '',
    'Total Amount': order.totalAmount,
    'Items Count': order.items.length
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function exportCustomersToExcel() {
  const customers = await prisma.customer.findMany({
    include: {
      _count: {
        select: { orders: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  const data = customers.map(c => ({
    'Name': c.name,
    'Company': c.company || '',
    'Email': c.email || '',
    'Phone': c.phone || '',
    'City': c.city || '',
    'State': c.state || '',
    'Country': c.country || '',
    'Total Orders': c._count.orders
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}





