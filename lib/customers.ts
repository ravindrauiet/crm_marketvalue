import { prisma } from './prisma';
import { ValidationError, cleanString, isEmail, isObjectId, pick } from './validation';

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

const CUSTOMER_FIELDS = ['name', 'type', 'company', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'country', 'taxId', 'notes'] as const;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** Whitelists and validates customer fields. `partial` = update (only sent fields). */
function customerData(body: any, partial: boolean) {
  if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(pick(body, CUSTOMER_FIELDS))) {
    data[k] = cleanString(v, k === 'notes' || k === 'address' ? 2000 : 200) || null;
  }

  if (!partial || 'name' in data) {
    if (!data.name) throw new ValidationError('Customer name is required');
  }
  if (data.type) {
    data.type = String(data.type).toUpperCase();
    if (!['CUSTOMER', 'VENDOR'].includes(data.type)) throw new ValidationError('Type must be CUSTOMER or VENDOR');
  }
  if (data.email) {
    data.email = data.email.toLowerCase();
    if (!isEmail(data.email)) throw new ValidationError('Email address is not valid');
  }
  if (data.phone && !/^[+]?[0-9\s\-()]{7,20}$/.test(data.phone)) {
    throw new ValidationError('Phone number is not valid');
  }
  if (data.taxId) {
    data.taxId = data.taxId.toUpperCase();
    if (data.taxId.length === 15 && !GSTIN_RE.test(data.taxId)) throw new ValidationError('GSTIN format is not valid');
  }
  return data;
}

export async function createCustomer(body: any) {
  const data = customerData(body, false);
  return await prisma.customer.create({ data: data as any });
}

export async function updateCustomer(id: string, body: any) {
  if (!isObjectId(id)) throw new ValidationError('Invalid customer id');
  return await prisma.customer.update({
    where: { id },
    data: customerData(body, true)
  });
}

export async function deleteCustomer(id: string) {
  if (!isObjectId(id)) throw new ValidationError('Invalid customer id');
  const invoices = await prisma.invoice.count({ where: { customerId: id } });
  if (invoices > 0) throw new ValidationError('This customer has invoices and cannot be deleted', 409);
  return await prisma.customer.delete({
    where: { id }
  });
}

