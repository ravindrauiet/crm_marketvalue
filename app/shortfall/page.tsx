"use client";
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import Icon from '@/components/Icon';
import HelpToggle from '@/components/HelpToggle';
import { readJson } from '@/lib/http';

type PO = {
  id: string; poNumber: string; chainName: string; status: string; totalAmount: number;
  poDate: string; appointmentDate: string | null; deliveryDate: string | null; items: unknown[];
};
type Status = 'SHORT' | 'OK' | 'DELIVERED' | 'NOT_MAPPED' | 'NO_STOCK_RECORD';
type ShortfallItem = {
  poId: string; chainItemCode: string; chainItemName: string; chainName: string; brandName: string;
  tallyItemName: string; eanCode: string; companyItemCode: string; companyItemName: string;
  pcsPerCase: number; caseSizeKnown: boolean; orderedPcs: number; deliveredPcs: number; reqPcs: number; reqCase: number;
  availableStock: number; totalStock: number; shortfallPcs: number; shortfallCases: number; status: Status;
  sourcePo: string; appointmentDate: string | null; dueDate: string; location: string;
};
type OrderLine = {
  companyItemCode: string; companyItemName: string; tallyItemName: string; brandName: string; eanCode: string;
  pcsPerCase: number; caseSizeKnown: boolean; shortfallPcs: number; orderCases: number; sourcePos: string[]; earliestDue: string;
};
type Result = {
  shortfallItems: ShortfallItem[]; orderLines: OrderLine[];
  counts: Record<Status, number>; stock: { loaded: boolean; lastUpdated: string | null };
};

const STATUS_INFO: Record<Status, { label: string; tone: string; hint: string }> = {
  SHORT: { label: 'Short', tone: 'error', hint: 'Not enough stock: order the shortfall from the company' },
  NO_STOCK_RECORD: { label: 'No stock record', tone: 'warn', hint: 'The Tally item is not in the stock list, so stock is taken as 0' },
  NOT_MAPPED: { label: 'Not mapped', tone: 'warn', hint: 'No item mapping for this chain item, so stock and company code are unknown' },
  OK: { label: 'In stock', tone: 'success', hint: 'Current stock covers this line' },
  DELIVERED: { label: 'Delivered', tone: 'info', hint: 'Already billed in Tally against this PO' },
};
const DAY_MS = 24 * 3600 * 1000;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const today = () => new Date().toLocaleDateString('en-CA');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dueOf = (po: PO) => po.appointmentDate || po.deliveryDate || po.poDate;

function ShortfallContent() {
  const searchParams = useSearchParams();
  const preselected = searchParams.get('pos')?.split(',').filter(Boolean) || [];

  const [pos, setPos] = useState<PO[]>([]);
  const [posError, setPosError] = useState('');
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselected));
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('ALL');
  const [showPast, setShowPast] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(preselected.length ? 2 : 1);
  const [result, setResult] = useState<Result | null>(null);
  const [calcError, setCalcError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');

  // Company order header (step 3). Kept separate so the PO lines keep their own dates.
  const [requiredBy, setRequiredBy] = useState('');
  const [deliverTo, setDeliverTo] = useState('');
  const [orderNote, setOrderNote] = useState('');

  useEffect(() => {
    fetch('/api/po')
      .then(r => readJson(r, 'the PO list').then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !Array.isArray(d)) throw new Error(d?.error || 'Could not load purchase orders');
        setPos(d.filter((po: PO) => po.status !== 'REMOVED'));
      })
      .catch(e => setPosError(e.message))
      .finally(() => setLoadingPOs(false));
  }, []);

  async function calculate(ids: string[]) {
    if (!ids.length) return;
    setLoading(true); setCalcError(''); setStep(2); setStatusFilter('ALL');
    try {
      const res = await fetch('/api/shortfall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poIds: ids }) });
      const data = await readJson(res, 'the shortfall calculation');
      if (!res.ok) throw new Error(data.error || 'Failed to calculate shortfall');
      setResult(data);
      const earliest = (data.orderLines as OrderLine[])[0]?.earliestDue;
      setRequiredBy(earliest ? earliest.slice(0, 10) : today());
    } catch (e: any) {
      setCalcError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Opened from the PO list with ?pos=id1,id2
  useEffect(() => {
    const ids = searchParams.get('pos')?.split(',').filter(Boolean) || [];
    if (ids.length) { setSelectedIds(new Set(ids)); calculate(ids); }
  }, [searchParams]);

  const chains = useMemo(() => [...new Set(pos.map(p => p.chainName))].sort(), [pos]);
  const visiblePOs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = Date.now() - DAY_MS;
    return pos
      .filter(p => chain === 'ALL' || p.chainName === chain)
      .filter(p => !q || p.poNumber.toLowerCase().includes(q))
      // Completed POs and POs past their date are hidden unless asked for
      .filter(p => showPast || (p.status !== 'COMPLETED' && new Date(dueOf(p)).getTime() >= cutoff))
      .sort((a, b) => dueOf(a).localeCompare(dueOf(b)));
  }, [pos, search, chain, showPast]);

  const toggle = (id: string) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const allVisibleSelected = visiblePOs.length > 0 && visiblePOs.every(p => selectedIds.has(p.id));
  const toggleAllVisible = () => setSelectedIds(prev => {
    const s = new Set(prev);
    visiblePOs.forEach(p => (allVisibleSelected ? s.delete(p.id) : s.add(p.id)));
    return s;
  });

  const items = result?.shortfallItems || [];
  const orderLines = result?.orderLines || [];
  // 'Short' covers lines with no stock record too: both go on the company order
  const displayItems = statusFilter === 'ALL' ? items
    : items.filter(i => i.status === statusFilter || (statusFilter === 'SHORT' && i.status === 'NO_STOCK_RECORD'));
  const notMapped = items.filter(i => i.status === 'NOT_MAPPED');
  const sourcePos = [...new Set(orderLines.flatMap(o => o.sourcePos))];
  const unknownCaseLines = orderLines.filter(o => !o.caseSizeKnown).length;

  function exportExcel() {
    if (!orderLines.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderLines.map((o, i) => ({
      'S.No': i + 1,
      'Company Item Code': o.companyItemCode || '—',
      'Company Item Name': o.companyItemName || '—',
      'Tally Item Name': o.tallyItemName,
      'Brand': o.brandName || '—',
      'EAN Code': o.eanCode || '—',
      'PCS per Case': o.caseSizeKnown ? o.pcsPerCase : 'unknown',
      'Shortfall (PCS)': o.shortfallPcs,
      'Order (CASES)': o.caseSizeKnown ? o.orderCases : '—',
      'Earliest Due': fmtDate(o.earliestDue),
      'Source POs': o.sourcePos.join(', '),
    }))), 'Company Order');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map((i, n) => ({
      'S.No': n + 1, 'Source PO': i.sourcePo, 'Chain': i.chainName, 'Chain Item Code': i.chainItemCode, 'Chain Item Name': i.chainItemName,
      'Tally Item Name': i.tallyItemName || '—', 'Company Item Code': i.companyItemCode || '—', 'Ordered (PCS)': i.orderedPcs,
      'Already Delivered (PCS)': i.deliveredPcs, 'Still Needed (PCS)': i.reqPcs, 'Stock Allocated': i.availableStock,
      'Shortfall (PCS)': i.shortfallPcs, 'PCS per Case': i.caseSizeKnown ? i.pcsPerCase : 'unknown', 'Shortfall (CASES)': i.caseSizeKnown ? i.shortfallCases : '—',
      'Status': STATUS_INFO[i.status].label, 'Due Date': fmtDate(i.dueDate),
    }))), 'PO Line Detail');
    if (notMapped.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notMapped.map(i => ({
        'Chain': i.chainName, 'Chain Item Code': i.chainItemCode, 'Chain Item Name': i.chainItemName, 'EAN Code': i.eanCode || '—',
        'Still Needed (PCS)': i.reqPcs, 'Source PO': i.sourcePo,
      }))), 'Needs Item Mapping');
    }
    XLSX.writeFile(wb, `Company_PO_${today()}.xlsx`);
  }

  function exportPdf() {
    if (!orderLines.length) return;
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups for this site to create the PDF.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Company Purchase Order ${esc(today())}</title>
      <style>
        @page { size: landscape; margin: 10mm; }
        body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 16px; }
        h1 { font-size: 22px; margin: 0 0 12px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
        .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-bottom: 14px; }
        .meta div { display: flex; flex-direction: column; }
        .label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #f1f5f9; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
        .r { text-align: right; } .mono { font-family: monospace; }
      </style></head><body>
      <h1>Company Purchase Order</h1>
      <div class="meta">
        <div><span class="label">Order date</span>${esc(fmtDate(new Date().toISOString()))}</div>
        <div><span class="label">Required by</span>${esc(requiredBy ? fmtDate(requiredBy) : '—')}</div>
        <div><span class="label">Deliver to</span>${esc(deliverTo || '—')}</div>
        <div><span class="label">Source POs</span>${esc(sourcePos.join(', '))}</div>
        ${orderNote ? `<div style="grid-column: span 4"><span class="label">Note</span>${esc(orderNote)}</div>` : ''}
      </div>
      <table><thead><tr><th>#</th><th>Company code</th><th>Company item</th><th>Tally item</th><th>Brand</th><th>EAN</th>
        <th class="r">PCS/case</th><th class="r">Shortfall PCS</th><th class="r">Order cases</th></tr></thead><tbody>
      ${orderLines.map((o, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(o.companyItemCode || '—')}</td><td>${esc(o.companyItemName || '—')}</td>
        <td>${esc(o.tallyItemName)}</td><td>${esc(o.brandName || '—')}</td><td class="mono">${esc(o.eanCode || '—')}</td>
        <td class="r">${o.caseSizeKnown ? o.pcsPerCase : '?'}</td><td class="r">${o.shortfallPcs}</td><td class="r"><b>${o.caseSizeKnown ? o.orderCases : '—'}</b></td></tr>`).join('')}
      </tbody></table>
      <script>window.onload = function () { window.print(); setTimeout(function () { window.close(); }, 500); };</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shortfall Planner</h1>
          <p className="page-subtitle">Select chain POs → see what current stock can’t cover → order the gap from the company.</p>
        </div>
        <div className="page-actions">
          <HelpToggle />
          <Link href="/po" className="btn secondary"><Icon name="po" size={16} />Purchase Orders</Link>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Steps">
        {([[1, 'Select POs'], [2, 'Check stock'], [3, 'Review & order']] as const).map(([n, label]) => (
          <button key={n} role="tab" aria-selected={step === n} disabled={n > 1 && !result}
            className={`tab${step === n ? ' active' : ''}`} onClick={() => setStep(n)}>
            <span className="tab-count">{n}</span>{label}
          </button>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <input type="search" placeholder="Search PO number…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} aria-label="Search PO number" />
            <select value={chain} onChange={e => setChain(e.target.value)} style={{ maxWidth: 180 }} aria-label="Chain">
              <option value="ALL">All chains</option>
              {chains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, color: 'var(--text)' }}>
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
              Include completed &amp; past-date POs
            </label>
            <div style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>{selectedIds.size} selected</span>
            <button className="btn" disabled={!selectedIds.size || loading} onClick={() => calculate([...selectedIds])}>
              Check stock for {selectedIds.size} PO{selectedIds.size === 1 ? '' : 's'} <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <p className="help-text" style={{ margin: 0, padding: '10px 20px 0' }}>
            Pick the chain POs you are about to supply. They are listed by delivery date, most urgent first; stock is given to the most urgent PO first.
            Quantities already billed in Tally against a PO are not needed again.
          </p>
          {loadingPOs ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : posError ? (
            <div className="alert error" style={{ margin: 16 }}>{posError}</div>
          ) : visiblePOs.length === 0 ? (
            <div className="empty-state">No POs match. {!showPast && 'Tick “Include completed & past-date POs” to see older ones.'} <Link href="/po/new" style={{ color: 'var(--primary)' }}>Upload a PO</Link></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all shown POs" /></th>
                    <th>Chain</th><th>PO number</th><th>PO date</th><th>Delivery by</th><th className="num">Lines</th><th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePOs.map(po => {
                    const due = new Date(dueOf(po)).getTime();
                    const days = Math.round((due - Date.now()) / DAY_MS);
                    return (
                      <tr key={po.id} onClick={() => toggle(po.id)} style={{ cursor: 'pointer', background: selectedIds.has(po.id) ? 'var(--primary-soft)' : undefined }}>
                        <td><input type="checkbox" checked={selectedIds.has(po.id)} onChange={() => toggle(po.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${po.poNumber}`} /></td>
                        <td><span className="badge">{po.chainName}</span></td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{po.poNumber}</td>
                        <td>{fmtDate(po.poDate)}</td>
                        <td>
                          {fmtDate(dueOf(po))}
                          {po.status === 'COMPLETED' ? <span className="badge success" style={{ marginLeft: 6 }}>Completed</span>
                            : days < 0 ? <span className="badge error" style={{ marginLeft: 6 }}>Past date</span>
                            : days <= 3 ? <span className="badge warn" style={{ marginLeft: 6 }}>{days === 0 ? 'Today' : `In ${days}d`}</span> : null}
                        </td>
                        <td className="num">{po.items.length}</td>
                        <td className="num">₹{po.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 & 3 shared states */}
      {step !== 1 && loading && (
        <div className="card empty-state"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Comparing PO requirements with current stock…</p></div>
      )}
      {step !== 1 && !loading && calcError && (
        <div className="alert error"><Icon name="alert" size={16} /><span style={{ flex: 1 }}>{calcError}</span><button className="btn secondary sm" onClick={() => setStep(1)}>Back to PO list</button></div>
      )}

      {/* STEP 2 */}
      {step === 2 && !loading && result && (
        <div>
          {!result.stock.loaded && (
            <div className="alert error" style={{ marginBottom: 12, alignItems: 'center' }}>
              <Icon name="alert" size={16} />
              <span style={{ flex: 1 }}><strong>No stock is loaded</strong>, so every line counts as short. Import the Tally closing-stock report first for a real shortfall.</span>
              <Link href="/products/import" className="btn secondary sm">Import stock</Link>
            </div>
          )}
          {notMapped.length > 0 && (
            <div className="alert warn" style={{ marginBottom: 12, alignItems: 'center' }}>
              <Icon name="mapping" size={16} />
              <span style={{ flex: 1 }}><strong>{notMapped.length} line(s) have no item mapping</strong>, so their stock and company code are unknown and they are left out of the company order. Add them in Item Mapping (they are listed in the Excel export).</span>
              <Link href="/item-mapping" className="btn secondary sm">Item Mapping</Link>
            </div>
          )}

          <div className="kpi-grid">
            {([['ALL', 'All lines', items.length], ['SHORT', 'Short — to order', result.counts.SHORT + result.counts.NO_STOCK_RECORD], ['OK', 'Covered by stock', result.counts.OK],
              ['DELIVERED', 'Already delivered', result.counts.DELIVERED], ['NOT_MAPPED', 'Not mapped', result.counts.NOT_MAPPED]] as const).map(([key, label, value]) => (
              <button key={key} type="button" className="kpi" onClick={() => setStatusFilter(key)}
                style={{ textAlign: 'left', cursor: 'pointer', outline: statusFilter === key ? '2px solid var(--primary)' : undefined }}>
                <span className="kpi-label">{label}</span>
                <span className="kpi-value">{value}</span>
              </button>
            ))}
          </div>
          <p className="help-text section-help">
            <strong>Still needed</strong> = ordered − already billed in Tally. <strong>Stock</strong> is what is left for this line after more urgent POs took theirs.
            <strong> Shortfall cases</strong> are rounded up to whole cases. Click a tile to filter the table.
          </p>

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '14px 20px 0' }}>
              <div>
                <h2 className="card-title">PO lines {statusFilter !== 'ALL' && `· ${statusFilter === 'SHORT' ? 'Short' : STATUS_INFO[statusFilter].label}`}</h2>
                <p className="card-subtitle">{displayItems.length} of {items.length} lines, most urgent PO first</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn secondary sm" onClick={() => setStep(1)}>← Change POs</button>
                <button className="btn sm" disabled={!orderLines.length} onClick={() => setStep(3)}>Review order ({orderLines.length}) <Icon name="arrowRight" size={14} /></button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>PO</th><th>Chain item</th><th>Tally item</th><th className="num">Ordered</th><th className="num">Delivered</th>
                    <th className="num">Still needed</th><th className="num">Stock</th><th className="num">Shortfall PCS</th><th className="num">PCS/case</th>
                    <th className="num">Shortfall cases</th><th>Status</th><th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((i, n) => (
                    <tr key={`${i.poId}-${n}`}>
                      <td style={{ whiteSpace: 'nowrap' }}><span className="badge" style={{ marginRight: 6 }}>{i.chainName}</span><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{i.sourcePo}</span></td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${i.chainItemCode} · ${i.chainItemName}`}>{i.chainItemName}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[i.tallyItemName, i.companyItemCode && `Company: ${i.companyItemCode} ${i.companyItemName}`].filter(Boolean).join('\n')}>
                        {i.tallyItemName || <span className="muted">—</span>}
                      </td>
                      <td className="num">{i.orderedPcs.toLocaleString('en-IN')}</td>
                      <td className="num">{i.deliveredPcs ? i.deliveredPcs.toLocaleString('en-IN') : <span className="muted">0</span>}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{i.reqPcs.toLocaleString('en-IN')}</td>
                      <td className="num">{i.status === 'NOT_MAPPED' || i.status === 'NO_STOCK_RECORD' ? <span className="muted">?</span> : i.availableStock.toLocaleString('en-IN')}</td>
                      <td className="num" style={{ fontWeight: 700, color: i.shortfallPcs ? 'var(--error)' : undefined }}>{i.shortfallPcs ? i.shortfallPcs.toLocaleString('en-IN') : '—'}</td>
                      <td className="num">{i.caseSizeKnown ? i.pcsPerCase : <span className="muted" title="Case size unknown: set PCS per case in Item Mapping">?</span>}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{i.shortfallPcs && i.caseSizeKnown ? i.shortfallCases : '—'}</td>
                      <td><span className={`badge ${STATUS_INFO[i.status].tone}`} title={STATUS_INFO[i.status].hint}>{STATUS_INFO[i.status].label}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && !loading && result && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div><h2 className="card-title">Order details</h2><p className="card-subtitle">Printed on the company purchase order</p></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
              <div><label htmlFor="req-by">Required by</label><input id="req-by" type="date" value={requiredBy} onChange={e => setRequiredBy(e.target.value)} /></div>
              <div><label htmlFor="deliver-to">Deliver to</label><input id="deliver-to" type="text" value={deliverTo} onChange={e => setDeliverTo(e.target.value)} placeholder="e.g. Glomin warehouse, Gurgaon" /></div>
              <div><label htmlFor="note">Note (optional)</label><input id="note" type="text" value={orderNote} onChange={e => setOrderNote(e.target.value)} /></div>
            </div>
            <p className="help-text" style={{ margin: '10px 0 0' }}>“Required by” defaults to the earliest delivery date among the short POs.</p>
          </div>

          {unknownCaseLines > 0 && (
            <div className="alert warn"><Icon name="alert" size={16} /><span>{unknownCaseLines} order line(s) have no case size in Item Mapping, so only pieces are shown for them.</span></div>
          )}

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '14px 20px 0' }}>
              <div>
                <h2 className="card-title">Company order · {orderLines.length} items</h2>
                <p className="card-subtitle">Shortfall combined per company item across {sourcePos.length} PO(s); cases rounded up</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn secondary sm" onClick={() => setStep(2)}>← Back</button>
                <button className="btn secondary sm" onClick={exportExcel}><Icon name="import" size={14} />Excel</button>
                <button className="btn sm" onClick={exportPdf}><Icon name="invoices" size={14} />PDF / Print</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Company item</th><th>Tally item</th><th>Brand</th><th className="num">PCS/case</th><th className="num">Shortfall PCS</th><th className="num">Order cases</th><th>Earliest due</th><th>Source POs</th></tr>
                </thead>
                <tbody>
                  {orderLines.map((o, n) => (
                    <tr key={n}>
                      <td className="muted">{n + 1}</td>
                      <td>{o.companyItemCode ? <><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{o.companyItemCode}</span><div className="muted" style={{ fontSize: 12 }}>{o.companyItemName}</div></> : <span className="muted">No company code</span>}</td>
                      <td>{o.tallyItemName}</td>
                      <td>{o.brandName || <span className="muted">—</span>}</td>
                      <td className="num">{o.caseSizeKnown ? o.pcsPerCase : <span className="muted">?</span>}</td>
                      <td className="num">{o.shortfallPcs.toLocaleString('en-IN')}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{o.caseSizeKnown ? o.orderCases : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.earliestDue)}</td>
                      <td style={{ fontSize: 12 }}>{o.sourcePos.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShortfallPage() {
  return <Suspense fallback={<div className="container empty-state"><div className="spinner" /></div>}><ShortfallContent /></Suspense>;
}
