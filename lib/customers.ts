import { prisma } from './prisma';

export async function listCustomers(query?: string) {
  const where: any = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { company: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query } }
    ];
  }

  return await prisma.customer.findMany({
    where,
    include: {
      _count: {
        select: { orders: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getCustomer(id: string) {
  return await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { orderDate: 'desc' },
        take: 10
      }
    }
  });
}

export async function createCustomer(data: {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  taxId?: string;
  notes?: string;
}) {
  return await prisma.customer.create({ data });
}

export async function updateCustomer(id: string, data: Partial<{
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  taxId: string;
  notes: string;
}>) {
  return await prisma.customer.update({
    where: { id },
    data
  });
}

export async function deleteCustomer(id: string) {
  return await prisma.customer.delete({
    where: { id }
  });
}

