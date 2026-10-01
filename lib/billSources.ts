// Daily Tally sale invoices (Fill Rate page upload) and OCR purchase bills share the PurchaseBill
// collection. Sale uploads are marked by notes starting with "PO:<po> | Party:<party>".
export const SALE_UPLOAD_NOTE_PREFIX = 'PO:';

export const SALE_UPLOAD_WHERE = { notes: { startsWith: SALE_UPLOAD_NOTE_PREFIX } };

// Null-safe "not a sale upload": Prisma's NOT alone would also drop bills with no notes
export const OCR_BILL_WHERE = {
  OR: [
    { notes: null },
    { notes: { isSet: false } },
    { NOT: { notes: { startsWith: SALE_UPLOAD_NOTE_PREFIX } } },
  ],
};

export function poNumberFromSaleNotes(notes: string | null | undefined): string {
  const m = (notes || '').match(/^PO:([^|]*)/);
  return m ? m[1].trim() : '';
}
