import { ValidationError, cleanString, toNumber } from './validation';

/** Optional non-negative money field: undefined = not sent, null = cleared, 0 is allowed */
function money(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = toNumber(v);
  if (n === null || n < 0) throw new ValidationError(`${field} must be a number of 0 or more`);
  return n;
}

function wholeNumber(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = toNumber(v);
  if (n === null || !Number.isInteger(n) || n < 0) throw new ValidationError(`${field} must be a whole number of 0 or more`);
  return n;
}

/** Builds Prisma data for a product update from only the fields present in the body */
export function productUpdateData(body: any) {
  if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');
  const data: Record<string, any> = {};
  if ('name' in body) {
    const name = cleanString(body.name, 300);
    if (!name) throw new ValidationError('Name cannot be blank');
    data.name = name;
  }
  for (const f of ['brand', 'group', 'description'] as const) {
    if (f in body) data[f] = cleanString(body[f], 2000) || null;
  }
  const price = money(body.price, 'Price');
  const cost = money(body.cost, 'Cost');
  const minStockThreshold = wholeNumber(body.minStockThreshold, 'Minimum stock');
  if (price !== undefined) data.price = price;
  if (cost !== undefined) data.cost = cost;
  if (minStockThreshold !== undefined) data.minStockThreshold = minStockThreshold;
  return data;
}

export function productCreateData(body: any) {
  if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');
  const sku = cleanString(body.sku, 100).toUpperCase();
  const name = cleanString(body.name, 300);
  if (!sku || !name) throw new ValidationError('SKU and Name are required');
  const initialStock = wholeNumber(body.initialStock, 'Initial stock') ?? 0;
  return {
    data: {
      sku,
      name,
      brand: cleanString(body.brand, 200) || null,
      group: cleanString(body.group, 200) || null,
      description: cleanString(body.description, 2000) || null,
      price: money(body.price, 'Price') ?? null,
      cost: money(body.cost, 'Cost') ?? null,
      minStockThreshold: wholeNumber(body.minStockThreshold, 'Minimum stock') ?? 10,
    },
    initialStock,
  };
}
