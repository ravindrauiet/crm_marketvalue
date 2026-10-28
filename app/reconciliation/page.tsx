"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Icon from '@/components/Icon';
import HelpToggle from '@/components/HelpToggle';
import { readJson } from '@/lib/http';
import { CHAINS } from '@/lib/chains';

type Kind = 'PAYMENT' | 'TDS' | 'CLAIM' | 'CREDIT_NOTE' | 'GST_DEBIT' | 'INVOICE' | 'OTHER';
type Line = {
  id: string; batchId: string; txnDate: string | null; narration: string; creditAmount: number; debitAmount: number; bankRef: string | null;
  matchStatus: string; matchedInvoiceNo: string | null; matchedPoNumber: string | null; chainName: string | null;
  deductionAmount: number; deductionReason: string | null; kind: Kind; amount: number; manual: boolean;
};
type Batch = { id: string; fileName: string; uploadedAt: string; rowCount: number; matchedCount: number; unmatchedCount: number; totalCredit: number; imagekitUrl?: string | null; notes?: string | null };
type Invoice = {
  invoiceNumber: string; invoiceDate: string; chain: string; poNumber: string; taxable: number; invoiceValue: number | null;
  received: number; deductions: number; balance: number; status: 'PAID' | 'PART' | 'UNPAID' | 'NIL'; ageDays: number | null; lastPayment: string; lineCount: number;
};
type ChainRow = { chain: string; invoices: number; billed: number; received: number; deductions: number; outstanding: number; paid: number; part: number; unpaid: number; unallocated: number; aging: { d0_30: number; d31_60: number; d61_90: number; d90: number } };
type InvoiceData = { invoices: Invoice[]; shown: number; total: number; totals: { billed: number; received: number; deductions: number; outstanding: number; paid: number; part: number; unpaid: number }; chains: ChainRow[]; unallocatedTotal: number };

const KIND_INFO: Record<Kind, { label: string; tone: string }> = {
  PAYMENT: { label: 'Payment', tone: 'success' }, TDS: { label: 'TDS', tone: 'warn' }, CLAIM: { label: 'Claim / shortage', tone: 'error' },
  CREDIT_NOTE: { label: 'Credit note', tone: 'warn' }, GST_DEBIT: { label: 'GST debit', tone: 'warn' }, INVOICE: { label: 'Invoice entry', tone: 'info' }, OTHER: { label: 'Other', tone: '' },
};
const INV_STATUS: Record<Invoice['status'], { label: string; tone: string }> = {
  PAID: { label: 'Paid', tone: 'success' }, PART: { label: 'Part paid', tone: 'warn' }, UNPAID: { label: 'Unpaid', tone: 'error' }, NIL: { label: 'No value', tone: '' },
};
const STATEMENT_TYPES = [
  ['party_advice', 'Payment / remittance advice (PDF, Excel, CSV or pasted text)'],
  ['ledger', 'Party ledger statement from the chain'],
  ['tally', 'Tally ledger of the party'],
  ['bank', 'Bank statement'],
] as const;

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export default function ReconciliationPage() {
  const [tab, setTab] = useState<'overview' | 'invoices' | 'lines' | 'upload'>('overview');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn'; text: string } | null>(null);

  // Invoices / overview
  const [inv, setInv] = useState<InvoiceData | null>(null);
  const [invLoading, setInvLoading] = useState(true);
  const [invChain, setInvChain] = useState('');
  const [invStatus, setInvStatus] = useState('');
  const [invFrom, setInvFrom] = useState('');
  const [invTo, setInvTo] = useState('');
  const [invSearch, setInvSearch] = useState('');

  // Statement lines
  const [lines, setLines] = useState<Line[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lineSummary, setLineSummary] = useState({ received: 0, deductions: 0, matched: 0, unmatched: 0, unmatchedAmount: 0, ignored: 0, totalRows: 0 });
  const [linesLoading, setLinesLoading] = useState(true);
  const [lineStatus, setLineStatus] = useState('');
  const [lineKind, setLineKind] = useState('');
  const [lineChain, setLineChain] = useState('');
  const [lineSearch, setLineSearch] = useState('');
  const [lineBatch, setLineBatch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linking, setLinking] = useState<Line | null>(null);
  const [linkInvoice, setLinkInvoice] = useState('');
  const [linkKind, setLinkKind] = useState<Kind>('PAYMENT');
  const [linkError, setLinkError] = useState('');

  // Upload
  const [statementType, setStatementType] = useState<string>('party_advice');
  const [uploadChain, setUploadChain] = useState('AUTO');
  const [uploading, setUploading] = useState(false);
  const [pasted, setPasted] = useState('');
  const [rematching, setRematching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadInvoices(); }, [invChain, invStatus, invFrom, invTo]);
  useEffect(() => { loadLines(); }, []);

  async function loadInvoices() {
    setInvLoading(true);
    const p = new URLSearchParams();
    if (invChain) p.set('chain', invChain);
    if (invStatus) p.set('status', invStatus);
    if (invFrom) p.set('from', invFrom);
    if (invTo) p.set('to', invTo);
    if (invSearch.trim()) p.set('search', invSearch.trim());
    try {
      const res = await fetch(`/api/reconciliation/invoices?${p}`);
      const data = await readJson(res, 'the invoice list');
      if (!res.ok) throw new Error(data.error || 'Could not load invoices');
      setInv(data);
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setInvLoading(false);
    }
  }

  async function loadLines() {
    setLinesLoading(true);
    try {
      const res = await fetch('/api/reconciliation');
      const data = await readJson(res, 'the statement lines');
      if (!res.ok) throw new Error(data.error || 'Could not load statement lines');
      setLines(data.rows || []);
      setBatches(data.batches || []);
      setLineSummary(data.summary);
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setLinesLoading(false);
    }
  }
  const refreshAll = () => Promise.all([loadInvoices(), loadLines()]);

  async function upload(file: File) {
    setUploading(true); setNotice(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('statementType', statementType);
    fd.append('chainName', uploadChain === 'AUTO' ? 'OTHER' : uploadChain);
    try {
      const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: fd });
      const data = await readJson(res, `"${file.name}"`);
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setNotice({
        tone: data.unmatched ? 'warn' : 'success',
        text: `${file.name}: ${data.total} line(s) read (chain ${data.detectedChain}) — ${data.matched} linked to an invoice, ${data.unmatched} to check` +
          (data.duplicatesSkipped ? `, ${data.duplicatesSkipped} already uploaded before (skipped)` : '') + '.',
      });
      await refreshAll();
      setTab(data.unmatched ? 'lines' : 'overview');
      if (data.unmatched) { setLineStatus('UNMATCHED'); setLineSearch(''); }
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function uploadPasted() {
    const text = pasted.trim();
    if (!text) return;
    await upload(new File([text], `pasted_payment_advice_${Date.now()}.txt`, { type: 'text/plain' }));
    setPasted('');
  }

  async function rematch() {
    setRematching(true); setNotice(null);
    try {
      const res = await fetch('/api/reconciliation/rematch', { method: 'POST' });
      const data = await readJson(res, 're-matching');
      if (!res.ok) throw new Error(data.error || 'Re-match failed');
      setNotice({ tone: 'success', text: `Re-checked ${data.checked} line(s) against the uploaded Tally invoices: ${data.byStatus.MATCHED || 0} linked, ${(data.byStatus.UNMATCHED || 0) + (data.byStatus.PARTIAL || 0)} still to check.${data.keptManual ? ` ${data.keptManual} line(s) you matched or ignored by hand were left as they are.` : ''}` });
      await refreshAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setRematching(false);
    }
  }

  async function lineAction(line: Line, body: Record<string, unknown>) {
    setBusyId(line.id);
    try {
      const res = await fetch(`/api/reconciliation/${line.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await readJson(res, 'the line');
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await refreshAll();
      return true;
    } catch (e: any) {
      if (body.action === 'match') setLinkError(e.message); else setNotice({ tone: 'error', text: e.message });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLine(line: Line) {
    if (!confirm(`Delete this ${KIND_INFO[line.kind].label.toLowerCase()} line of ${inr(line.amount)}? Use “Ignore” instead if you may need it later.`)) return;
    setBusyId(line.id);
    try {
      const res = await fetch(`/api/reconciliation/${line.id}`, { method: 'DELETE' });
      const data = await readJson(res, 'the delete');
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      await refreshAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBatch(b: Batch) {
    if (!confirm(`Delete the upload “${b.fileName}” and its ${b.rowCount} line(s)?`)) return;
    try {
      const res = await fetch(`/api/reconciliation?batchId=${b.id}`, { method: 'DELETE' });
      const data = await readJson(res, 'the delete');
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setNotice({ tone: 'success', text: data.message });
      await refreshAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    }
  }

  function openLink(line: Line) {
    setLinking(line);
    setLinkInvoice(line.matchedInvoiceNo || '');
    setLinkKind(line.kind === 'OTHER' ? 'PAYMENT' : line.kind);
    setLinkError('');
  }

  function showInvoiceLines(invoiceNo: string) {
    setLineStatus(''); setLineKind(''); setLineChain(''); setLineBatch(''); setLineSearch(invoiceNo); setTab('lines');
  }

  function exportInvoices() {
    if (!inv?.invoices.length) return;
    const ws = XLSX.utils.json_to_sheet(inv.invoices.map(i => ({
      'Invoice No': i.invoiceNumber, 'Invoice Date': i.invoiceDate, 'Chain': i.chain, 'PO Number': i.poNumber,
      'Taxable Value': Math.round(i.taxable * 100) / 100, 'Invoice Value (incl. GST, from ledger)': i.invoiceValue ?? '',
      'Received': i.received, 'Deductions': i.deductions, 'Balance': i.balance, 'Status': INV_STATUS[i.status].label,
      'Age (days)': i.ageDays ?? '', 'Last Payment': i.lastPayment,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receivables');
    XLSX.writeFile(wb, `Receivables_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  }

  const lineChains = useMemo(() => [...new Set(lines.map(l => l.chainName).filter(Boolean) as string[])].sort(), [lines]);
  const shownLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    return lines.filter(l =>
      (!lineStatus || (lineStatus === 'UNMATCHED' ? l.matchStatus === 'UNMATCHED' || l.matchStatus === 'PARTIAL' : l.matchStatus === lineStatus)) &&
      (!lineKind || l.kind === lineKind) &&
      (!lineChain || l.chainName === lineChain) &&
      (!lineBatch || l.batchId === lineBatch) &&
      (!q || [l.narration, l.matchedInvoiceNo, l.matchedPoNumber, l.bankRef, l.deductionReason].some(v => (v || '').toLowerCase().includes(q))));
  }, [lines, lineStatus, lineKind, lineChain, lineSearch, lineBatch]);
  // Unmatched lines that name an invoice: usually that month's Tally sales aren't uploaded yet
  const waitingForInvoices = lines.filter(l => (l.matchStatus === 'UNMATCHED' || l.matchStatus === 'PARTIAL') && l.matchedInvoiceNo && l.kind !== 'INVOICE').length;
  const totals = inv?.totals;

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Reconciliation</h1>
          <p className="page-subtitle">Match chain payments, TDS and claims to your Tally sale invoices, and see what each chain still owes.</p>
        </div>
        <div className="page-actions">
          <HelpToggle />
          <button className="btn secondary" onClick={rematch} disabled={rematching} title="Link saved lines to invoices uploaded since">
            <Icon name="reco" size={16} />{rematching ? 'Re-matching…' : 'Re-match lines'}
          </button>
          <button className="btn" onClick={() => setTab('upload')}><Icon name="import" size={16} />Upload statement</button>
        </div>
      </div>

      <div className="help-only card" style={{ marginBottom: 16, padding: 16 }}>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <li><strong>Upload</strong> what the chain sends — payment / remittance advice, party ledger — or paste the payment email.</li>
          <li>Each line is read as a <strong>payment</strong>, <strong>TDS</strong>, <strong>claim</strong>, <strong>credit note</strong> or an <strong>invoice entry</strong>, and linked to the Tally sale invoice it names.</li>
          <li><strong>Statement lines</strong> lists anything that couldn’t be linked: link it to an invoice yourself, or ignore it.</li>
          <li><strong>Invoices</strong> shows every Tally invoice as paid, part paid or unpaid, and <strong>Overview</strong> what each chain still owes, by age.</li>
        </ol>
      </div>

      {notice && (
        <div className={`alert ${notice.tone}`} style={{ marginBottom: 14 }}>
          <Icon name={notice.tone === 'success' ? 'check' : 'alert'} size={16} />
          <span style={{ flex: 1 }}>{notice.text}</span>
          <button className="btn ghost sm" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label">Billed (Tally invoices)</span>
          <span className="kpi-value">{inr(totals?.billed || 0)}</span>
          <span className="kpi-foot">{inv?.total.toLocaleString('en-IN') || 0} invoices{invChain ? ` · ${invChain}` : ''}</span>
          <span className="help-text kpi-help">Taxable value of the uploaded Tally sale invoices (GST-inclusive where a Tally ledger gave it).</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot success" aria-hidden="true" />Received</span>
          <span className="kpi-value">{inr(totals?.received || 0)}</span>
          <span className="kpi-foot">{totals?.paid || 0} paid · {totals?.part || 0} part paid</span>
          <span className="help-text kpi-help">Payments linked to these invoices.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot warn" aria-hidden="true" />Deductions</span>
          <span className="kpi-value">{inr(totals?.deductions || 0)}</span>
          <span className="kpi-foot">TDS, claims, credit notes</span>
          <span className="help-text kpi-help">Amounts the chain kept back — they settle the invoice without money arriving.</span>
        </div>
        <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => { setInvStatus('UNPAID'); setTab('invoices'); }}>
          <span className="kpi-label"><span className="status-dot error" aria-hidden="true" />Outstanding</span>
          <span className="kpi-value">{inr(totals?.outstanding || 0)}</span>
          <span className="kpi-foot">{totals?.unpaid || 0} unpaid invoices</span>
          <span className="help-text kpi-help">Still owed: invoice value minus payments and deductions.</span>
        </button>
        <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => { setLineStatus('UNMATCHED'); setLineKind(''); setTab('lines'); }}>
          <span className="kpi-label"><span className="status-dot warn" aria-hidden="true" />To check</span>
          <span className="kpi-value">{lineSummary.unmatched}</span>
          <span className="kpi-foot">{inr(lineSummary.unmatchedAmount)} not linked to an invoice</span>
          <span className="help-text kpi-help">Statement lines that need you to link or ignore them.</span>
        </button>
      </div>

      {waitingForInvoices > 0 && (
        <div className="alert info" style={{ marginBottom: 14, alignItems: 'center' }}>
          <Icon name="alert" size={16} />
          <span style={{ flex: 1 }}>
            <strong>{waitingForInvoices} line(s) name an invoice that isn’t in the system yet</strong> — usually that month’s Tally sale report hasn’t been uploaded.
            Upload it on the Fill Rate page, then click <strong>Re-match lines</strong>.
          </span>
          <a href="/po/reconciliation-report" className="btn secondary sm">Fill Rate page</a>
        </div>
      )}

      <div className="tabs" role="tablist">
        {([['overview', 'Overview', undefined], ['invoices', 'Invoices', inv?.total], ['lines', 'Statement lines', lineSummary.totalRows], ['upload', 'Upload', batches.length]] as const).map(([id, label, count]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}{count !== undefined && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: '14px 20px 0' }}>
            <div><h2 className="card-title">Outstanding by chain</h2><p className="card-subtitle">Click a chain to see its invoices</p></div>
          </div>
          <p className="help-text card-help" style={{ padding: '0 20px' }}>
            Ageing splits what is still owed by how old the invoice is. <strong>Unlinked receipts</strong> is money received from the chain that isn’t tied to an invoice yet
            (lump-sum payments, or invoices not uploaded) — it will reduce the outstanding once linked.
          </p>
          {invLoading && !inv ? <div className="empty-state"><div className="spinner" /></div> : !inv?.chains.length ? (
            <div className="empty-state">No Tally sale invoices uploaded yet. Upload the daily sale report on the Fill Rate page first.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Chain</th><th className="num">Invoices</th><th className="num">Billed</th><th className="num">Received</th><th className="num">Deductions</th><th className="num">Outstanding</th><th className="num">0–30 d</th><th className="num">31–60 d</th><th className="num">61–90 d</th><th className="num">90+ d</th><th className="num">Unlinked receipts</th></tr></thead>
                <tbody>
                  {inv.chains.map(c => (
                    <tr key={c.chain} style={{ cursor: 'pointer' }} onClick={() => { setInvChain(c.chain === 'UNKNOWN' ? '' : c.chain); setInvStatus(''); setTab('invoices'); }}>
                      <td><span className="badge">{c.chain}</span></td>
                      <td className="num">{c.invoices}<div className="muted" style={{ fontSize: 11 }}>{c.paid} paid · {c.unpaid} unpaid</div></td>
                      <td className="num">{inr(c.billed)}</td>
                      <td className="num" style={{ color: 'var(--success)' }}>{inr(c.received)}</td>
                      <td className="num">{inr(c.deductions)}</td>
                      <td className="num" style={{ fontWeight: 700, color: c.outstanding ? 'var(--error)' : undefined }}>{inr(c.outstanding)}</td>
                      <td className="num">{inr(c.aging.d0_30)}</td>
                      <td className="num">{inr(c.aging.d31_60)}</td>
                      <td className="num">{inr(c.aging.d61_90)}</td>
                      <td className="num" style={{ color: c.aging.d90 ? 'var(--error)' : undefined }}>{inr(c.aging.d90)}</td>
                      <td className="num">{c.unallocated ? inr(c.unallocated) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INVOICES */}
      {tab === 'invoices' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <input type="search" placeholder="Invoice or PO number… (Enter)" value={invSearch} onChange={e => setInvSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadInvoices(); }} style={{ flex: '1 1 200px' }} aria-label="Search invoices" />
            <select value={invChain} onChange={e => setInvChain(e.target.value)} style={{ flex: '0 0 150px' }} aria-label="Chain">
              <option value="">All chains</option>{CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={invStatus} onChange={e => setInvStatus(e.target.value)} style={{ flex: '0 0 140px' }} aria-label="Status">
              <option value="">All statuses</option><option value="UNPAID">Unpaid</option><option value="PART">Part paid</option><option value="PAID">Paid</option><option value="NIL">No value</option>
            </select>
            <label style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}>From <input type="date" value={invFrom} onChange={e => setInvFrom(e.target.value)} /></label>
            <label style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}>To <input type="date" value={invTo} onChange={e => setInvTo(e.target.value)} /></label>
            <button className="btn secondary sm" onClick={exportInvoices} disabled={!inv?.invoices.length}><Icon name="import" size={14} />Excel</button>
          </div>
          <p className="help-text" style={{ margin: 0, padding: '10px 20px 0' }}>
            <strong>Balance</strong> = invoice value − received − deductions. Tally’s sale report gives values before GST; when only that is known, payments (which include GST)
            covering it count as paid. Click an invoice to see the lines linked to it.
          </p>
          {invLoading ? <div className="empty-state"><div className="spinner" /></div> : !inv?.invoices.length ? (
            <div className="empty-state">No invoices match these filters.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Invoice</th><th>Date</th><th>Chain</th><th>PO</th><th className="num">Value</th><th className="num">Received</th><th className="num">Deductions</th><th className="num">Balance</th><th>Status</th><th className="num">Age</th></tr></thead>
                  <tbody>
                    {inv.invoices.map(i => (
                      <tr key={i.invoiceNumber} style={{ cursor: i.lineCount ? 'pointer' : undefined }} onClick={() => i.lineCount && showInvoiceLines(i.invoiceNumber)}>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{i.invoiceNumber}{i.lineCount > 0 && <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>({i.lineCount})</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.invoiceDate)}</td>
                        <td>{i.chain ? <span className="badge">{i.chain}</span> : <span className="muted">—</span>}</td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{i.poNumber || '—'}</td>
                        <td className="num" title={i.invoiceValue ? 'Incl. GST, from the Tally ledger' : 'Taxable value (before GST)'}>{inr(i.invoiceValue || i.taxable)}{!i.invoiceValue && <span className="muted" style={{ fontSize: 10 }}> +GST</span>}</td>
                        <td className="num" style={{ color: i.received ? 'var(--success)' : undefined }}>{i.received ? inr(i.received) : <span className="muted">—</span>}</td>
                        <td className="num">{i.deductions ? inr(i.deductions) : <span className="muted">—</span>}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{i.balance ? inr(i.balance) : <span className="muted">0</span>}</td>
                        <td><span className={`badge ${INV_STATUS[i.status].tone}`}>{INV_STATUS[i.status].label}</span></td>
                        <td className="num" style={{ color: i.status !== 'PAID' && (i.ageDays || 0) > 60 ? 'var(--error)' : undefined }}>{i.ageDays ?? '—'}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {inv.total > inv.shown && <p className="muted" style={{ padding: '10px 20px', margin: 0, fontSize: 12.5 }}>Showing the newest {inv.shown} of {inv.total}. Narrow the filters, or use Excel for the full list of shown rows.</p>}
            </>
          )}
        </div>
      )}

      {/* STATEMENT LINES */}
      {tab === 'lines' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <input type="search" placeholder="Invoice, PO, UTR or description…" value={lineSearch} onChange={e => setLineSearch(e.target.value)} style={{ flex: '1 1 220px' }} aria-label="Search lines" />
            <select value={lineStatus} onChange={e => setLineStatus(e.target.value)} style={{ flex: '0 0 150px' }} aria-label="Status">
              <option value="">All lines</option><option value="UNMATCHED">To check</option><option value="MATCHED">Linked</option><option value="IGNORED">Ignored</option>
            </select>
            <select value={lineKind} onChange={e => setLineKind(e.target.value)} style={{ flex: '0 0 150px' }} aria-label="Line type">
              <option value="">All types</option>{(Object.keys(KIND_INFO) as Kind[]).map(k => <option key={k} value={k}>{KIND_INFO[k].label}</option>)}
            </select>
            <select value={lineChain} onChange={e => setLineChain(e.target.value)} style={{ flex: '0 0 140px' }} aria-label="Chain">
              <option value="">All chains</option>{lineChains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {lineBatch && (
              <button className="badge info" style={{ cursor: 'pointer' }} onClick={() => setLineBatch('')} title="Show lines from all uploads">
                {batches.find(b => b.id === lineBatch)?.fileName || 'One upload'} ✕
              </button>
            )}
            <span className="muted" style={{ fontSize: 13 }}>{shownLines.length} of {lines.length}</span>
          </div>
          <p className="help-text" style={{ margin: 0, padding: '10px 20px 0' }}>
            <strong>Link</strong> ties a line to a Tally invoice (you can also correct its type). <strong>Ignore</strong> keeps a line out of the totals — e.g. a duplicate
            or a lump-sum bank entry already covered by the advice. Lines you link or ignore by hand are not changed by Re-match.
          </p>
          {linesLoading && !lines.length ? <div className="empty-state"><div className="spinner" /></div> : !shownLines.length ? (
            <div className="empty-state">{lines.length ? 'No lines match these filters.' : 'Nothing uploaded yet — use the Upload tab.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Chain</th><th>Type</th><th>Description</th><th>Invoice</th><th className="num">Amount</th><th>Status</th><th className="num">Actions</th></tr></thead>
                <tbody>
                  {shownLines.map(l => {
                    const unmatched = l.matchStatus === 'UNMATCHED' || l.matchStatus === 'PARTIAL';
                    return (
                      <tr key={l.id} style={{ opacity: l.matchStatus === 'IGNORED' ? 0.55 : 1 }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.txnDate)}</td>
                        <td>{l.chainName ? <span className="badge">{l.chainName}</span> : <span className="muted">—</span>}</td>
                        <td><span className={`badge ${KIND_INFO[l.kind].tone}`}>{KIND_INFO[l.kind].label}</span></td>
                        <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[l.narration, l.bankRef && `Ref: ${l.bankRef}`, l.deductionReason && `Reason: ${l.deductionReason}`].filter(Boolean).join('\n')}>
                          {l.narration}
                          {l.bankRef && <div className="muted" style={{ fontSize: 11 }}>Ref {l.bankRef}</div>}
                        </td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                          {l.matchedInvoiceNo || <span className="muted">—</span>}
                          {unmatched && l.matchedInvoiceNo && <div style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--warning)' }}>not uploaded yet</div>}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {inr(l.amount)}
                          {l.kind === 'PAYMENT' && l.deductionAmount > 0 && <div className="muted" style={{ fontSize: 11 }}>TDS {inr(l.deductionAmount)}</div>}
                        </td>
                        <td>
                          {l.matchStatus === 'MATCHED' ? <span className="badge success">Linked{l.manual ? ' (manual)' : ''}</span>
                            : l.matchStatus === 'IGNORED' ? <span className="badge">Ignored</span>
                            : <span className="badge warn">To check</span>}
                        </td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {l.matchStatus === 'IGNORED' ? (
                            <button className="btn secondary sm" disabled={busyId === l.id} onClick={() => lineAction(l, { action: 'restore' })}>Restore</button>
                          ) : (
                            <>
                              <button className="btn secondary sm" disabled={busyId === l.id} onClick={() => openLink(l)}>{l.matchStatus === 'MATCHED' ? 'Change' : 'Link'}</button>{' '}
                              {l.matchStatus === 'MATCHED' && <><button className="btn ghost sm" disabled={busyId === l.id} onClick={() => lineAction(l, { action: 'unmatch' })}>Unlink</button>{' '}</>}
                              <button className="btn ghost sm" disabled={busyId === l.id} onClick={() => lineAction(l, { action: 'ignore' })}>Ignore</button>
                            </>
                          )}{' '}
                          <button className="btn ghost sm" disabled={busyId === l.id} onClick={() => deleteLine(l)} aria-label="Delete line" title="Delete line"><Icon name="close" size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD */}
      {tab === 'upload' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div><h2 className="card-title">Upload a statement</h2><p className="card-subtitle">PDF, Excel, CSV — or paste the payment email below</p></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12, alignItems: 'end' }}>
              <div>
                <label htmlFor="st-type">What is it?</label>
                <select id="st-type" value={statementType} onChange={e => setStatementType(e.target.value)}>
                  {STATEMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="st-chain">From which chain?</label>
                <select id="st-chain" value={uploadChain} onChange={e => setUploadChain(e.target.value)}>
                  <option value="AUTO">Detect automatically</option>
                  {CHAINS.filter(c => c !== 'OTHER').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                <button className="btn" style={{ width: '100%' }} disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Icon name="import" size={16} />{uploading ? 'Reading and matching…' : 'Choose file'}
                </button>
              </div>
            </div>
            <label htmlFor="pasted" style={{ marginTop: 16 }}>Or paste the payment advice / email text</label>
            <textarea id="pasted" rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Copy the table from the payment email (UTR, invoice numbers, amounts, TDS…) and paste it here" style={{ resize: 'vertical' }} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn secondary" disabled={uploading || !pasted.trim()} onClick={uploadPasted}>Read pasted text</button>
            </div>
            <p className="help-text" style={{ margin: '8px 0 0' }}>
              Excel and CSV statements are read directly; PDFs and pasted emails are read by AI, so check the lines afterwards. Lines already uploaded before are skipped automatically.
            </p>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '14px 20px 0' }}><div><h2 className="card-title">Uploaded files</h2><p className="card-subtitle">Deleting an upload removes its lines</p></div></div>
            {!batches.length ? <div className="empty-state">Nothing uploaded yet.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>File</th><th>Details</th><th>Uploaded</th><th className="num">Lines</th><th className="num">Linked</th><th className="num">To check</th><th className="num"></th></tr></thead>
                  <tbody>
                    {batches.map(b => (
                      <tr key={b.id}>
                        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.fileName}>
                          {b.imagekitUrl ? <a href={b.imagekitUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{b.fileName}</a> : b.fileName}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>{b.notes}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.uploadedAt)}</td>
                        <td className="num">{b.rowCount}</td>
                        <td className="num" style={{ color: 'var(--success)' }}>{b.matchedCount}</td>
                        <td className="num" style={{ color: b.unmatchedCount ? 'var(--warning)' : undefined }}>{b.unmatchedCount}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn ghost sm" onClick={() => { setLineSearch(''); setLineStatus(''); setLineKind(''); setLineChain(''); setLineBatch(b.id); setTab('lines'); }}>View lines</button>{' '}
                          <button className="btn danger sm" onClick={() => deleteBatch(b)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link dialog */}
      {linking && (
        <div role="dialog" aria-modal="true" aria-labelledby="link-title" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '48px 16px' }}>
          <form className="card" style={{ width: '100%', maxWidth: 480 }} onSubmit={async e => { e.preventDefault(); if (await lineAction(linking, { action: 'match', invoiceNo: linkInvoice, kind: linkKind })) setLinking(null); }}>
            <h2 id="link-title" style={{ fontSize: 17, marginBottom: 6 }}>Link line to an invoice</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{fmtDate(linking.txnDate)} · {inr(linking.amount)} · {linking.narration}</p>
            <label htmlFor="link-inv">Tally invoice number *</label>
            <input id="link-inv" required autoFocus value={linkInvoice} onChange={e => setLinkInvoice(e.target.value)} placeholder="e.g. GO/2627/3499" style={{ fontFamily: 'ui-monospace, monospace' }} />
            <label htmlFor="link-kind" style={{ marginTop: 12 }}>This line is a…</label>
            <select id="link-kind" value={linkKind} onChange={e => setLinkKind(e.target.value as Kind)}>
              {(Object.keys(KIND_INFO) as Kind[]).filter(k => k !== 'OTHER').map(k => <option key={k} value={k}>{KIND_INFO[k].label}</option>)}
            </select>
            {linkError && <div className="alert error" style={{ marginTop: 12 }}><Icon name="alert" size={16} />{linkError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => setLinking(null)}>Cancel</button>
              <button type="submit" className="btn" style={{ flex: 2 }} disabled={busyId === linking.id}>{busyId === linking.id ? 'Linking…' : 'Link'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
