import { prisma } from './prisma';
import { SALE_UPLOAD_WHERE, poNumberFromSaleNotes } from './billSources';
import { InvoiceRef, makeInvoiceIndex } from './recoMatch';
import { normalizeChain } from './chains';

/** Tally sale invoices (daily uploads on the Fill Rate page) as matching targets */
export async function loadInvoiceRefs(): Promise<InvoiceRef[]> {
  const bills = await prisma.purchaseBill.findMany({
    where: SALE_UPLOAD_WHERE,
    select: { invoiceNumber: true, invoiceDate: true, supplierName: true, totalAmount: true, notes: true },
  });
  return bills.filter(b => b.invoiceNumber).map(b => ({
    invoiceNumber: b.invoiceNumber!.trim(),
    poNumber: poNumberFromSaleNotes(b.notes),
    chain: normalizeChain(b.supplierName),
    date: b.invoiceDate,
    taxable: b.totalAmount || 0,
  }));
}

export async function loadInvoiceIndex() {
  return makeInvoiceIndex(await loadInvoiceRefs());
}
