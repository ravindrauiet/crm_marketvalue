import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadInvoiceRefs } from '@/lib/recoData';
import { classifyLine, isDeductionKind, lineAmount, noteKind } from '@/lib/recoMatch';

const DAY_MS = 24 * 3600 * 1000;
const ROW_LIMIT = 500;

// GET /api/reconciliation/invoices?chain=&status=PAID|PART|UNPAID&from=&to=&search=
// Every Tally sale invoice with what was received and deducted against it, and what is still owed.
// Invoice value is the GST-inclusive amount from an uploaded Tally ledger when available; otherwise
// only the taxable value is known, and payments (which include GST) covering it count as settled.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const chain = (sp.get('chain') || '').toUpperCase();
    const status = (sp.get('status') || '').toUpperCase();
    const from = sp.get('from') ? new Date(`${sp.get('from')}T00:00:00.000Z`) : null;
    const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999Z`) : null;
    const search = (sp.get('search') || '').trim().toLowerCase();

    const [invoices, lines] = await Promise.all([
      loadInvoiceRefs(),
      prisma.paymentReco.findMany({ where: { matchStatus: { not: 'IGNORED' } } }),
    ]);

    type Agg = { received: number; deductions: number; ledgerValue: number; lastPayment: Date | null; lines: number };
    const byInvoice = new Map<string, Agg>();
    const unallocated: Record<string, number> = {};
    for (const l of lines) {
      const kind = noteKind(l.notes) || classifyLine(l);
      const amount = lineAmount(l);
      if (!l.matchedInvoiceNo || l.matchStatus !== 'MATCHED') {
        if (kind === 'PAYMENT') unallocated[l.chainName || 'UNKNOWN'] = (unallocated[l.chainName || 'UNKNOWN'] || 0) + amount;
        continue;
      }
      const key = l.matchedInvoiceNo.toUpperCase();
      const a = byInvoice.get(key) || { received: 0, deductions: 0, ledgerValue: 0, lastPayment: null, lines: 0 };
      a.lines++;
      if (kind === 'INVOICE') a.ledgerValue = Math.max(a.ledgerValue, amount);
      else if (kind === 'PAYMENT') {
        a.received += amount;
        a.deductions += Math.abs(l.deductionAmount || 0);
        if (l.txnDate && (!a.lastPayment || l.txnDate > a.lastPayment)) a.lastPayment = l.txnDate;
      } else if (isDeductionKind(kind)) a.deductions += amount;
      byInvoice.set(key, a);
    }

    const now = Date.now();
    const all = invoices.map(inv => {
      const a = byInvoice.get(inv.invoiceNumber.toUpperCase());
      const received = a?.received || 0;
      const deductions = a?.deductions || 0;
      // A ledger figure counts as the GST-inclusive value only when it is plausible for this invoice (GST up to 28%)
      const ledger = a?.ledgerValue || 0;
      const invoiceValue = ledger && inv.taxable > 0 && ledger >= inv.taxable * 0.99 && ledger <= inv.taxable * 1.3 ? ledger : 0;
      const due = invoiceValue || inv.taxable;
      const settled = received + deductions;
      const balance = Math.max(0, due - settled);
      // NIL: zero / negative value entries (credit notes, cancelled vouchers) — nothing to collect
      const st = due <= 0 ? 'NIL' : balance < Math.max(1, due * 0.005) ? 'PAID' : settled > 0 ? 'PART' : 'UNPAID';
      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.date ? inv.date.toISOString().slice(0, 10) : '',
        chain: inv.chain,
        poNumber: inv.poNumber,
        taxable: inv.taxable,
        invoiceValue: invoiceValue || null,
        received,
        deductions,
        balance: st === 'PAID' || st === 'NIL' ? 0 : balance,
        status: st,
        ageDays: inv.date ? Math.floor((now - inv.date.getTime()) / DAY_MS) : null,
        lastPayment: a?.lastPayment ? a.lastPayment.toISOString().slice(0, 10) : '',
        lineCount: a?.lines || 0,
      };
    });

    const filtered = all.filter(i =>
      (!chain || i.chain === chain) &&
      (!status || i.status === status) &&
      (!from || (i.invoiceDate && new Date(i.invoiceDate) >= from)) &&
      (!to || (i.invoiceDate && new Date(i.invoiceDate) <= to)) &&
      (!search || [i.invoiceNumber, i.poNumber, i.chain].some(v => v.toLowerCase().includes(search)))
    ).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNumber.localeCompare(a.invoiceNumber));

    // Per chain over the date/search-filtered set (status filter aside, so the overview stays whole)
    const scope = all.filter(i =>
      (!from || (i.invoiceDate && new Date(i.invoiceDate) >= from)) && (!to || (i.invoiceDate && new Date(i.invoiceDate) <= to)));
    const chains: Record<string, any> = {};
    for (const i of scope) {
      const c = chains[i.chain || 'UNKNOWN'] ||= { chain: i.chain || 'UNKNOWN', invoices: 0, billed: 0, received: 0, deductions: 0, outstanding: 0, paid: 0, part: 0, unpaid: 0, aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 }, unallocated: 0 };
      c.invoices++; c.billed += i.invoiceValue || i.taxable; c.received += i.received; c.deductions += i.deductions; c.outstanding += i.balance;
      if (i.status !== 'NIL') c[i.status === 'PAID' ? 'paid' : i.status === 'PART' ? 'part' : 'unpaid']++;
      if (i.balance > 0 && i.ageDays !== null) {
        const b = i.ageDays <= 30 ? 'd0_30' : i.ageDays <= 60 ? 'd31_60' : i.ageDays <= 90 ? 'd61_90' : 'd90';
        c.aging[b] += i.balance;
      }
    }
    Object.entries(unallocated).forEach(([c, v]) => { if (chains[c]) chains[c].unallocated = v; });

    const sum = (f: (i: (typeof filtered)[number]) => number) => filtered.reduce((s, i) => s + f(i), 0);
    return NextResponse.json({
      invoices: filtered.slice(0, ROW_LIMIT),
      shown: Math.min(filtered.length, ROW_LIMIT),
      total: filtered.length,
      totals: {
        billed: sum(i => i.invoiceValue || i.taxable), received: sum(i => i.received), deductions: sum(i => i.deductions), outstanding: sum(i => i.balance),
        paid: filtered.filter(i => i.status === 'PAID').length, part: filtered.filter(i => i.status === 'PART').length, unpaid: filtered.filter(i => i.status === 'UNPAID').length,
      },
      chains: Object.values(chains).sort((a: any, b: any) => b.outstanding - a.outstanding),
      unallocatedTotal: Object.values(unallocated).reduce((s, v) => s + v, 0),
    });
  } catch (err: any) {
    console.error('❌ [RECO INVOICES ERROR]', err);
    return NextResponse.json({ error: 'Failed to build the invoice view: ' + err.message }, { status: 500 });
  }
}
