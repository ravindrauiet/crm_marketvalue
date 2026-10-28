// Links payment-advice / ledger lines to Tally sale invoices. Used by the upload, the
// "re-match" action and manual matching on the Payment Reconciliation page.
import { normalizeChain } from './chains';
import { normPo } from './poDelivery';

export type LineKind = 'PAYMENT' | 'TDS' | 'CLAIM' | 'CREDIT_NOTE' | 'GST_DEBIT' | 'INVOICE' | 'OTHER';

export const KIND_LABEL: Record<LineKind, string> = {
  PAYMENT: 'Payment received',
  TDS: 'TDS',
  CLAIM: 'Claim / shortage',
  CREDIT_NOTE: 'Credit note / scheme',
  GST_DEBIT: 'GST debit',
  INVOICE: 'Invoice entry',
  OTHER: 'Other',
};

/** Deductions reduce what the chain owes, like a payment does */
export const isDeductionKind = (k: LineKind) => k === 'TDS' || k === 'CLAIM' || k === 'CREDIT_NOTE' || k === 'GST_DEBIT';

type LineInput = { narration?: string | null; creditAmount: number; debitAmount: number; invoiceNumber?: string | null; deductionReason?: string | null };

export function classifyLine(l: LineInput): LineKind {
  const n = (l.narration || '').toLowerCase();
  const t = `${n} ${l.deductionReason || ''} ${l.invoiceNumber || ''}`.toLowerCase();
  // "Invoice Payment" lines may carry a TDS note beside them; the line itself is the payment
  if (/\bpayment\b|receipt|neft|rtgs|imps/.test(n) && !/tds|claim|shortage|debit/.test(n)) return 'PAYMENT';
  if (/\btds\b|194q|194c|194j|tax deducted/.test(t)) return 'TDS';
  if (/gst debit/.test(t)) return 'GST_DEBIT';
  if (/shortage|claim|damage|penalt|chargeback|short supply|rejection/.test(t)) return 'CLAIM';
  if (/\bcn\/|credit note|scheme|promo|rate diff|discount/.test(t)) return 'CREDIT_NOTE';
  // Tally party-ledger sale entries ("IGST 5% Sale A/c") record the invoice itself, not money
  if (/sale a\/c|sales a\/c|sales bill|^\s*invoice\s*$/.test(t)) return 'INVOICE';
  if (/payment|receipt|neft|rtgs|imps|utr|##yes|remittance|paid/.test(t) || l.creditAmount > 0) return 'PAYMENT';
  return 'OTHER';
}

/** Line amount, always positive (statements put the same figure in credit, debit or both) */
export const lineAmount = (l: { creditAmount: number; debitAmount: number }) => Math.max(Math.abs(l.creditAmount || 0), Math.abs(l.debitAmount || 0));

// Tally voucher numbers like GO/2627/1863, MTR-GDN2627-160, CN/NONGST/2627/59.
// (?!\d) instead of \b so "GO/2627/3202INR…" yields GO/2627/3202, and GO/2627/3 never matches inside it.
const VOUCHER_RE = /[A-Z]{1,6}(?:[\/-][A-Z0-9]{1,8}){1,3}(?![\dA-Z\/])/gi;
// The usual series (GO/2627/1863) even when PDF text runs on into the next word
const SERIES_RE = /[A-Z]{1,6}\/\d{4}\/\d+(?!\d)/gi;

/** Invoice numbers mentioned on a line, most specific first ("GO/2627/3363-TDS-CM-ISYK" -> GO/2627/3363) */
export function invoiceCandidates(...texts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of texts) {
    const s = (raw || '').trim();
    if (!s) continue;
    out.push(s);
    out.push(s.replace(/[_\s].*$/, '').replace(/-(?:TDS|GST|CM|DN|CN)\b.*$/i, ''));
    for (const m of s.matchAll(SERIES_RE)) out.push(m[0]);
    for (const m of s.matchAll(VOUCHER_RE)) out.push(m[0]);
  }
  return [...new Set(out.map(x => x.toUpperCase()).filter(x => x.length >= 4))];
}

/** Chain for a reco line; bank names (HSBC…) are not chains */
export function lineChain(name: string | null | undefined): string {
  const c = normalizeChain(name);
  return !c || c === 'OTHER' || /HSBC|BANK/.test(c) ? '' : c;
}

export type InvoiceRef = { invoiceNumber: string; poNumber: string; chain: string; date: Date | null; taxable: number };

export function makeInvoiceIndex(invoices: InvoiceRef[]) {
  const byNumber = new Map(invoices.map(i => [i.invoiceNumber.toUpperCase(), i]));
  const byPo = new Map<string, InvoiceRef[]>();
  invoices.forEach(i => { const k = normPo(i.poNumber); if (k) byPo.set(k, [...(byPo.get(k) || []), i]); });
  return { byNumber, byPo };
}

export type MatchResult = {
  kind: LineKind;
  invoice: InvoiceRef | null;
  /** Invoice number the line refers to, kept even when that invoice isn't uploaded yet */
  referencedInvoice: string;
  poNumber: string;
  chain: string;
  amount: number;
};

/** Finds the invoice a line belongs to: its own invoice number first, then a PO with a single invoice */
export function matchLine(
  l: LineInput & { poNumber?: string | null; chainName?: string | null },
  index: ReturnType<typeof makeInvoiceIndex>,
  // Re-matching saved lines: their stored invoice number may be an old wrong guess, so the
  // number written in the description comes first
  preferNarration = false,
): MatchResult {
  const kind = classifyLine(l);
  let invoice: InvoiceRef | null = null;
  // ...and when the description itself names an invoice, the stored number is not used at all
  const narrationNamesInvoice = preferNarration && new RegExp(SERIES_RE.source, 'i').test(l.narration || '');
  const texts = preferNarration ? (narrationNamesInvoice ? [l.narration] : [l.narration, l.invoiceNumber]) : [l.invoiceNumber, l.narration];
  const candidates = invoiceCandidates(...texts);
  for (const c of candidates) {
    const hit = index.byNumber.get(c);
    if (hit) { invoice = hit; break; }
  }
  // Best guess at the number meant: a clean series number ("GO/2627/3499"), else the line's own invoice field
  const referencedInvoice = invoice?.invoiceNumber
    || candidates.find(c => new RegExp(`^${SERIES_RE.source}$`, 'i').test(c))
    || (l.invoiceNumber || '').trim().toUpperCase();
  const po = normPo(l.poNumber);
  if (po) {
    const forPo = index.byPo.get(po) || [];
    // Only when unambiguous: a PO billed in several invoices can't tell which one was paid.
    // The PO also wins when it disagrees with the invoice number (old uploads saved some lines
    // with the neighbouring row's invoice number; the PO sits on the same row as the amount).
    if (forPo.length === 1 && (!invoice || normPo(invoice.poNumber) !== po)) invoice = forPo[0];
  }
  return {
    kind,
    invoice,
    referencedInvoice,
    poNumber: invoice?.poNumber || (l.poNumber || '').replace(/^\s*po\s*#?\s*/i, '').toUpperCase(),
    chain: invoice?.chain || lineChain(l.chainName),
    amount: lineAmount(l),
  };
}

// The line kind and manual flags live in `notes` ("Source: TALLY | kind:PAYMENT | manual")
export function noteKind(notes: string | null | undefined): LineKind | null {
  const m = (notes || '').match(/kind:([A-Z_]+)/);
  return m ? (m[1] as LineKind) : null;
}
export const isManual = (notes: string | null | undefined) => /\bmanual\b/.test(notes || '');
export function withNotes(notes: string | null | undefined, kind: LineKind, manual: boolean) {
  const base = (notes || '').split('|').map(s => s.trim()).filter(s => s && !s.startsWith('kind:') && s !== 'manual');
  return [...base, `kind:${kind}`, ...(manual ? ['manual'] : [])].join(' | ');
}

/** Stored fields for a line once matched (or not) */
export function matchFields(m: MatchResult, deductionOnLine: number) {
  const linked = !!m.invoice;
  return {
    matchStatus: linked ? 'MATCHED' : 'UNMATCHED',
    // Unmatched lines keep the number they refer to, so a later re-match can link them
    matchedInvoiceNo: m.referencedInvoice || null,
    matchedPoNumber: m.poNumber || null,
    chainName: m.chain || null,
    matchedAmount: linked && (m.kind === 'PAYMENT' || isDeductionKind(m.kind)) ? m.amount : 0,
    pendingAmount: linked ? 0 : m.amount,
    // A deduction line's own amount, or the TDS printed beside a payment (Flipkart ledgers)
    deductionAmount: isDeductionKind(m.kind) ? m.amount : Math.abs(deductionOnLine || 0),
  };
}
