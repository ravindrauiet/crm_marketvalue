"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Icon from '@/components/Icon';
import HelpToggle from '@/components/HelpToggle';
import { readJson } from '@/lib/http';
import { CHAINS } from '@/lib/chains';

type Mapping = {
  id: string; chainName: string; chainItemCode: string; chainItemName: string; tallyItemName: string;
  tallyItemSku?: string | null; eanCode?: string | null; brandName?: string | null; companyItemCode?: string | null;
  companyItemName?: string | null; pcsPerCase: number; notes?: string | null;
  brand: string; brandInferred: boolean; tallyFound: '' | 'stock' | 'sales';
};
type Unmapped = {
  chainName: string; chainItemCode: string; chainItemName: string; eanCode: string; poCount: number; totalPcs: number; lastPoDate: string;
  suggestion: { tallyItemName: string; source: string; companyItemCode: string; companyItemName: string; pcsPerCase: number | null; brandName: string };
};

const emptyForm = {
  chainName: 'FLIPKART', chainItemCode: '', chainItemName: '', tallyItemName: '', tallyItemSku: '', eanCode: '',
  brandName: '', companyItemCode: '', companyItemName: '', pcsPerCase: '1', notes: '',
};
// Column names match what Bulk Upload reads
const UPLOAD_COLUMNS = ['Chain Name', 'Chain Item Code', 'Chain Item Name', 'Tally Item Name', 'Tally Item SKU', 'EAN Code', 'Brand Name', 'Company Item Code', 'Company Item Name', 'PCS Per Case', 'Notes'];
const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export default function ItemMappingPage() {
  const [tab, setTab] = useState<'mappings' | 'unmapped'>('mappings');
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [meta, setMeta] = useState({ total: 0, tallyNotFound: 0, brands: [] as string[], chainCounts: {} as Record<string, number>, tallyNames: [] as string[] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn'; text: string; details?: string[] } | null>(null);

  const [filterChain, setFilterChain] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onlyNotFound, setOnlyNotFound] = useState(false);

  const [unmapped, setUnmapped] = useState<Unmapped[] | null>(null);
  const [unmappedLoading, setUnmappedLoading] = useState(false);
  const [unmappedChain, setUnmappedChain] = useState('');
  const [unmappedSearch, setUnmappedSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadMappings(); }, [filterChain, filterBrand, debouncedSearch]);
  // The "needs mapping" count shows on its tab from the start
  useEffect(() => { loadUnmapped(); }, []);

  async function loadMappings() {
    const id = ++requestId.current;
    setLoading(true); setError('');
    const params = new URLSearchParams();
    if (filterChain) params.set('chain', filterChain);
    if (filterBrand) params.set('brand', filterBrand);
    if (debouncedSearch) params.set('search', debouncedSearch);
    try {
      const res = await fetch(`/api/item-mapping?${params}`);
      const data = await readJson(res, 'the mappings');
      if (id !== requestId.current) return; // a newer search has started
      if (!res.ok) throw new Error(data.error || 'Failed to load mappings');
      setMappings(data.mappings || []);
      setMeta({ total: data.total || 0, tallyNotFound: data.tallyNotFound || 0, brands: data.brands || [], chainCounts: data.chainCounts || {}, tallyNames: data.tallyNames || [] });
    } catch (e: any) {
      if (id === requestId.current) setError(e.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function loadUnmapped() {
    setUnmappedLoading(true);
    try {
      const res = await fetch('/api/item-mapping/unmapped');
      const data = await readJson(res, 'the unmapped items');
      if (!res.ok) throw new Error(data.error || 'Failed to load unmapped items');
      setUnmapped(data.items || []);
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setUnmappedLoading(false);
    }
  }

  const refreshAll = () => { loadMappings(); loadUnmapped(); };

  function downloadSampleExcel() {
    const sample = [
      ['AMAZON', 'B08G5QLVJ4', "Mother's Recipe Rice Papad Jeera Pouch,75 Gram", "Mother's Recipe Rice Papad Jeera 75g", 'SKU-PAPAD-001', '8906001053453', "Mother's Recipe", 'MR-PAPAD-JEERA-75G', "Mother's Recipe Rice Papad Jeera Pouch 75g", 24, 'Sample mapping for Amazon'],
      ['ZEPTO', '318922', 'Eastern Meat Masala Powder Pouch - 1 pack (100 g)', 'Eastern Meat Masala 100g', 'EAST-MM-100', '8901440013280', 'Eastern', 'EAST-MM-100G', 'Eastern Meat Masala 100g Pouch', 40, 'Sample mapping for Zepto'],
      ['DMART', '8906012240019', 'DILBAHAR ANARDANA GOLI(100G)', 'Dilbahar Anardana Goli 100g', 'DIL-AG-100', '8906012240019', 'Dilbahar', 'DIL-ANARDANA-100G', 'Dilbahar Anardana Goli 100g Pouch', 48, 'Sample mapping for DMart'],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([UPLOAD_COLUMNS, ...sample]), 'Item Mappings');
    XLSX.writeFile(wb, 'Item_Mapping_Sample_Format.xlsx');
  }

  // Unmapped items in the upload format, suggestions filled in, ready to check and upload back
  function exportUnmapped() {
    if (!unmappedShown.length) return;
    const rows = unmappedShown.map(u => [u.chainName, u.chainItemCode, u.chainItemName, u.suggestion.tallyItemName, '', u.eanCode,
      u.suggestion.brandName, u.suggestion.companyItemCode, u.suggestion.companyItemName, u.suggestion.pcsPerCase ?? '',
      u.suggestion.tallyItemName ? 'Suggested from Tally invoices — please check' : '']);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([UPLOAD_COLUMNS, ...rows]), 'Item Mappings');
    XLSX.writeFile(wb, `Unmapped_Items_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  }

  async function uploadFile(file: File) {
    setUploading(true); setNotice(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/item-mapping/upload', { method: 'POST', body: fd });
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setNotice({
        tone: data.skipped ? 'warn' : 'success',
        text: `Upload done: ${data.created} added, ${data.updated} updated${data.skipped ? `, ${data.skipped} row(s) skipped` : ''}.`,
        details: data.skippedRows,
      });
      refreshAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  }

  function openForm(values: Partial<typeof emptyForm>, id: string | null = null) {
    setForm({ ...emptyForm, ...values });
    setEditingId(id);
    setFormError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const res = await fetch(editingId ? `/api/item-mapping/${editingId}` : '/api/item-mapping', {
        method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await readJson(res, 'the mapping');
      if (!res.ok) throw new Error(data.error || 'Could not save the mapping');
      setShowModal(false);
      setNotice({ tone: 'success', text: `Mapping ${editingId ? 'updated' : 'added'}: ${form.chainName} ${form.chainItemCode} → ${form.tallyItemName}` });
      refreshAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(m: Mapping) {
    if (!confirm(`Remove the mapping ${m.chainName} ${m.chainItemCode} → ${m.tallyItemName}?`)) return;
    try {
      const res = await fetch(`/api/item-mapping/${m.id}`, { method: 'DELETE' });
      const data = await readJson(res, 'the delete');
      if (!res.ok) throw new Error(data.error || 'Could not remove the mapping');
      setNotice({ tone: 'success', text: `Removed ${m.chainName} ${m.chainItemCode}.` });
      refreshAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: e.message });
    }
  }

  const shownMappings = onlyNotFound ? mappings.filter(m => !m.tallyFound) : mappings;
  const unmappedChains = useMemo(() => [...new Set((unmapped || []).map(u => u.chainName))].sort(), [unmapped]);
  const unmappedShown = useMemo(() => {
    const q = unmappedSearch.trim().toLowerCase();
    return (unmapped || []).filter(u => (!unmappedChain || u.chainName === unmappedChain)
      && (!q || [u.chainItemCode, u.chainItemName, u.eanCode, u.suggestion.tallyItemName].some(v => v.toLowerCase().includes(q))));
  }, [unmapped, unmappedChain, unmappedSearch]);
  const chainOptions = [...new Set([...CHAINS, form.chainName].filter(Boolean))];

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Item Mapping</h1>
          <p className="page-subtitle">Link each chain’s item code to your Tally item, company order code and case size.</p>
        </div>
        <div className="page-actions">
          <HelpToggle />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
          <button onClick={downloadSampleExcel} className="btn secondary">Sample format</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn secondary"><Icon name="import" size={16} />{uploading ? 'Uploading…' : 'Bulk upload'}</button>
          <button onClick={() => openForm({ chainName: filterChain || 'FLIPKART' })} className="btn"><Icon name="plus" size={16} />Add mapping</button>
        </div>
      </div>

      <p className="help-text section-help">
        Chain POs name products their own way (an ASIN, FSN or Zepto code). A mapping tells the system which <strong>Tally item</strong> that is,
        so stock, Tally invoices and the <strong>company order code</strong> and <strong>case size</strong> line up. Unmapped items show as “Not mapped”
        in the Shortfall Planner and can’t be ordered.
      </p>

      {notice && (
        <div className={`alert ${notice.tone}`} style={{ marginBottom: 14 }}>
          <Icon name={notice.tone === 'success' ? 'check' : 'alert'} size={16} />
          <div style={{ flex: 1 }}>
            {notice.text}
            {!!notice.details?.length && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>{notice.details.map(d => <li key={d}>{d}</li>)}</ul>}
          </div>
          <button className="btn ghost sm" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mappings'} className={`tab${tab === 'mappings' ? ' active' : ''}`} onClick={() => setTab('mappings')}>
          Mappings <span className="tab-count">{meta.total}</span>
        </button>
        <button role="tab" aria-selected={tab === 'unmapped'} className={`tab${tab === 'unmapped' ? ' active' : ''}`} onClick={() => setTab('unmapped')}>
          Needs mapping {unmapped && <span className="tab-count" style={unmapped.length ? { background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: '#fde68a' } : undefined}>{unmapped.length}</span>}
        </button>
      </div>

      {tab === 'mappings' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(meta.chainCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <button key={c} type="button" onClick={() => setFilterChain(filterChain === c ? '' : c)} className={`period-pill${filterChain === c ? ' active' : ''}`}>
                {c} · {n}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <input type="search" placeholder="Search code, item, Tally name, EAN, company code…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 240px' }} aria-label="Search mappings" />
              <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ flex: '0 0 160px' }} aria-label="Chain">
                <option value="">All chains</option>
                {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ flex: '0 0 170px' }} aria-label="Brand">
                <option value="">All brands</option>
                {meta.brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {meta.tallyNotFound > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, color: 'var(--warning)' }}>
                  <input type="checkbox" checked={onlyNotFound} onChange={e => setOnlyNotFound(e.target.checked)} />
                  Tally name not found ({meta.tallyNotFound})
                </label>
              )}
              <span className="muted" style={{ fontSize: 13 }}>{shownMappings.length} shown</span>
            </div>

            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : error ? (
              <div className="alert error" style={{ margin: 16 }}>{error}</div>
            ) : shownMappings.length === 0 ? (
              <div className="empty-state">{meta.total ? 'No mappings match these filters.' : 'No mappings yet — add one, or bulk upload the sample format.'}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Chain</th><th>Chain code</th><th>Chain item name</th><th>Tally item</th><th>EAN</th><th>Brand</th><th>Company item</th><th className="num">PCS/case</th><th className="num">Action</th></tr>
                  </thead>
                  <tbody>
                    {shownMappings.map(m => (
                      <tr key={m.id}>
                        <td><span className="badge">{m.chainName}</span></td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{m.chainItemCode}</td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.chainItemName}>{m.chainItemName}</td>
                        <td style={{ fontWeight: 600 }}>
                          {m.tallyItemName}
                          {!m.tallyFound && <span title="This name is not in the stock list or any Tally sale invoice — check the spelling, otherwise stock and invoices never match this item" style={{ marginLeft: 6, color: 'var(--warning)', cursor: 'help' }}>⚠</span>}
                        </td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{m.eanCode || <span className="muted">—</span>}</td>
                        <td>{m.brand ? <span className="badge" title={m.brandInferred ? 'Guessed from the item name — set Brand to fix it' : undefined} style={m.brandInferred ? { fontStyle: 'italic' } : undefined}>{m.brand}</span> : <span className="muted">—</span>}</td>
                        <td style={{ fontSize: 12.5 }}>
                          {m.companyItemCode ? <><span style={{ fontFamily: 'ui-monospace, monospace' }}>{m.companyItemCode}</span><div className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.companyItemName || ''}>{m.companyItemName}</div></> : <span className="muted">—</span>}
                        </td>
                        <td className="num">{m.pcsPerCase > 1 ? m.pcsPerCase : <span style={{ color: 'var(--warning)' }} title="Case size not set — company orders can't be worked out in cases">1 ⚠</span>}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn secondary sm" onClick={() => openForm({
                            chainName: m.chainName, chainItemCode: m.chainItemCode, chainItemName: m.chainItemName, tallyItemName: m.tallyItemName,
                            tallyItemSku: m.tallyItemSku || '', eanCode: m.eanCode || '', brandName: m.brandName || '', companyItemCode: m.companyItemCode || '',
                            companyItemName: m.companyItemName || '', pcsPerCase: String(m.pcsPerCase), notes: m.notes || '',
                          }, m.id)}>Edit</button>{' '}
                          <button className="btn danger sm" onClick={() => handleDelete(m)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'unmapped' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <input type="search" placeholder="Search code, item or suggestion…" value={unmappedSearch} onChange={e => setUnmappedSearch(e.target.value)} style={{ flex: '1 1 220px' }} aria-label="Search unmapped items" />
            <select value={unmappedChain} onChange={e => setUnmappedChain(e.target.value)} style={{ flex: '0 0 160px' }} aria-label="Chain">
              <option value="">All chains</option>
              {unmappedChains.map(c => <option key={c} value={c}>{c} · {(unmapped || []).filter(u => u.chainName === c).length}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>{unmappedShown.length} items</span>
            <div style={{ flex: 1 }} />
            <button className="btn secondary sm" onClick={exportUnmapped} disabled={!unmappedShown.length}><Icon name="import" size={14} />Export to fill in Excel</button>
          </div>
          <p className="help-text" style={{ margin: 0, padding: '10px 20px 0' }}>
            Chain items on your current POs with no mapping, most-ordered first. The <strong>suggested Tally item</strong> is what was actually billed in Tally
            for that PO line; case size comes from another mapping of the same item or the pack in the Tally name (“30x500g” = 30). Check it, then click <strong>Map</strong> —
            or export, fill the gaps in Excel and bring it back with Bulk upload.
          </p>
          {unmappedLoading && !unmapped ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : unmappedShown.length === 0 ? (
            <div className="empty-state"><Icon name="check" size={16} style={{ color: 'var(--success)' }} /> Every item on your POs is mapped.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Chain</th><th>Chain code</th><th>Chain item name</th><th className="num">POs</th><th className="num">Total PCS</th><th>Last PO</th><th>Suggested Tally item</th><th className="num"></th></tr>
                </thead>
                <tbody>
                  {unmappedShown.map(u => (
                    <tr key={`${u.chainName}-${u.chainItemCode}`}>
                      <td><span className="badge">{u.chainName}</span></td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{u.chainItemCode || '—'}</td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[u.chainItemName, u.eanCode && `EAN ${u.eanCode}`].filter(Boolean).join('\n')}>{u.chainItemName}</td>
                      <td className="num">{u.poCount}</td>
                      <td className="num">{u.totalPcs.toLocaleString('en-IN')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.lastPoDate)}</td>
                      <td>
                        {u.suggestion.tallyItemName ? (
                          <>
                            <span style={{ fontWeight: 600 }}>{u.suggestion.tallyItemName}</span>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {[u.suggestion.pcsPerCase && `${u.suggestion.pcsPerCase}/case`, u.suggestion.companyItemCode].filter(Boolean).join(' · ') || 'no case size / company code yet'}
                            </div>
                          </>
                        ) : <span className="muted">No Tally invoice yet</span>}
                      </td>
                      <td className="num">
                        <button className="btn sm" onClick={() => openForm({
                          chainName: u.chainName, chainItemCode: u.chainItemCode, chainItemName: u.chainItemName, eanCode: u.eanCode,
                          tallyItemName: u.suggestion.tallyItemName, brandName: u.suggestion.brandName, companyItemCode: u.suggestion.companyItemCode,
                          companyItemName: u.suggestion.companyItemName, pcsPerCase: String(u.suggestion.pcsPerCase || 1),
                        })}>Map</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="mapping-form-title" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '32px 16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: 600 }}>
            <h2 id="mapping-form-title" style={{ fontSize: 17, marginBottom: 16 }}>{editingId ? 'Edit' : 'Add'} item mapping</h2>
            <form onSubmit={handleSave}>
              <datalist id="tally-names">{meta.tallyNames.map(n => <option key={n} value={n} />)}</datalist>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
                <div>
                  <label htmlFor="f-chain">Chain *</label>
                  <select id="f-chain" value={form.chainName} onChange={e => setForm({ ...form, chainName: e.target.value })}>
                    {chainOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-code">Chain item code *</label>
                  <input id="f-code" required value={form.chainItemCode} onChange={e => setForm({ ...form, chainItemCode: e.target.value })} placeholder="ASIN / FSN / SKU code on the PO" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label htmlFor="f-name">Chain item name *</label>
                  <input id="f-name" required value={form.chainItemName} onChange={e => setForm({ ...form, chainItemName: e.target.value })} placeholder="Name as printed on the chain PO" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label htmlFor="f-tally">Tally item name * <span className="muted" style={{ fontWeight: 400 }}>— pick from the list so it matches Tally exactly</span></label>
                  <input id="f-tally" required list="tally-names" value={form.tallyItemName} onChange={e => setForm({ ...form, tallyItemName: e.target.value })} placeholder="Start typing…" />
                  {form.tallyItemName && meta.tallyNames.length > 0 && !meta.tallyNames.some(n => n.toLowerCase() === form.tallyItemName.replace(/\s+/g, ' ').trim().toLowerCase()) && (
                    <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>Not found in stock or Tally invoices — check the spelling.</div>
                  )}
                </div>
                <div>
                  <label htmlFor="f-ean">EAN / barcode</label>
                  <input id="f-ean" value={form.eanCode} onChange={e => setForm({ ...form, eanCode: e.target.value })} placeholder="Separate several with commas" />
                </div>
                <div>
                  <label htmlFor="f-brand">Brand</label>
                  <input id="f-brand" value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value })} placeholder="e.g. MTR, Eastern" />
                </div>
                <div>
                  <label htmlFor="f-cocode">Company item code</label>
                  <input id="f-cocode" value={form.companyItemCode} onChange={e => setForm({ ...form, companyItemCode: e.target.value })} placeholder="Code used when ordering from the company" />
                </div>
                <div>
                  <label htmlFor="f-coname">Company item name</label>
                  <input id="f-coname" value={form.companyItemName} onChange={e => setForm({ ...form, companyItemName: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="f-pcs">PCS per case *</label>
                  <input id="f-pcs" required type="number" min="1" step="1" value={form.pcsPerCase} onChange={e => setForm({ ...form, pcsPerCase: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="f-sku">Tally SKU</label>
                  <input id="f-sku" value={form.tallyItemSku} onChange={e => setForm({ ...form, tallyItemSku: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label htmlFor="f-notes">Notes</label>
                  <textarea id="f-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ resize: 'vertical' }} />
                </div>
              </div>
              {formError && <div className="alert error" style={{ marginTop: 14 }}><Icon name="alert" size={16} />{formError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={saving} className="btn" style={{ flex: 2 }}>{saving ? 'Saving…' : editingId ? 'Update mapping' : 'Save mapping'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
