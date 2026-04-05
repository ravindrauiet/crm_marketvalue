"use client";
import { useState, useEffect, useRef } from 'react';

type RecoRow = {
  id: string; txnDate?: string; narration: string;
  debitAmount: number; creditAmount: number; balance: number; bankRef?: string;
  matchStatus: string; matchedInvoiceNo?: string; matchedPoNumber?: string;
  matchedAmount: number; pendingAmount: number; chainName?: string;
  deductionAmount: number; deductionReason?: string; notes?: string;
};
type Batch = { id: string; fileName: string; uploadedAt: string; rowCount: number; matchedCount: number; unmatchedCount: number; totalCredit: number; totalDebit: number };
type Summary = { totalCredit: number; totalMatched: number; totalPartial: number; totalUnmatched: number; totalPending: number };

const STATUS = {
  MATCHED: { label: '✅ Matched', color: '#065f46', bg: '#d1fae5' },
  PARTIAL: { label: '🟡 Partial', color: '#92400e', bg: '#fef3c7' },
  UNMATCHED: { label: '❌ Unmatched', color: '#991b1b', bg: '#fee2e2' },
  IGNORED: { label: '⏭ Ignored', color: '#6b7280', bg: '#f3f4f6' },
};

const CHAIN_COLORS: Record<string, string> = { FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6', BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225', DMART: '#E91B23' };

export default function ReconciliationPage() {
  const [tab, setTab] = useState<'upload' | 'match' | 'dashboard'>('upload');
  const [rows, setRows] = useState<RecoRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalCredit: 0, totalMatched: 0, totalPartial: 0, totalUnmatched: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChain, setFilterChain] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadData(); }, [filterStatus, filterChain]);

  async function loadData() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    const res = await fetch(`/api/reconciliation?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setBatches(Array.isArray(data.batches) ? data.batches : []);
    setSummary(data.summary || {});
    setLoading(false);
  }

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true); setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setUploadResult({ ...data, success: true });
        await loadData();
        setTab('match');
      } else {
        setUploadResult({ error: data.error });
      }
    } catch (err: any) {
      setUploadResult({ error: err.message });
    }
    setUploading(false);
  }

  const filteredRows = rows.filter(r =>
    (!filterStatus || r.matchStatus === filterStatus) &&
    (!filterChain || r.chainName === filterChain)
  );

  const chains = [...new Set(rows.filter(r => r.chainName).map(r => r.chainName!))];

  // Chain-wise outstanding for dashboard
  const chainStats = chains.map(chain => {
    const chainRows = rows.filter(r => r.chainName === chain && r.creditAmount > 0);
    return {
      chain,
      received: chainRows.reduce((s, r) => s + r.matchedAmount, 0),
      pending: chainRows.reduce((s, r) => s + r.pendingAmount, 0),
      total: chainRows.reduce((s, r) => s + r.creditAmount, 0),
      txns: chainRows.length,
    };
  }).sort((a, b) => b.pending - a.pending);

  return (
    <div className="container fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          💰 Payment Reconciliation
        </h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Upload bank statement → Auto-match with invoices → Real-time outstanding view</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Received', value: `₹${(summary.totalCredit || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bg: 'linear-gradient(135deg,#10b981,#059669)' },
          { label: 'Matched', value: summary.totalMatched || 0, bg: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
          { label: 'Partial', value: summary.totalPartial || 0, bg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
          { label: 'Unmatched', value: summary.totalUnmatched || 0, bg: 'linear-gradient(135deg,#ef4444,#dc2626)' },
          { label: 'Pending Amount', value: `₹${(summary.totalPending || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 18, background: s.bg, border: 'none', color: '#fff' }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--bg-secondary)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[{ id: 'upload', label: '📤 Upload Statement' }, { id: 'match', label: '🔗 Match Rows' }, { id: 'dashboard', label: '📊 Dashboard' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className="btn" style={{ background: tab === t.id ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, padding: '8px 20px', boxShadow: 'none', border: 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* UPLOAD TAB */}
      {tab === 'upload' && (
        <div>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="card" style={{ padding: 56, textAlign: 'center', cursor: 'pointer', border: `2px dashed ${dragOver ? '#0ea5e9' : 'var(--border)'}`, background: dragOver ? '#f0f9ff' : 'var(--bg-secondary)', transition: 'all 0.2s', marginBottom: 24 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
            {uploading ? (
              <div><div className="spinner" style={{ margin: '0 auto 16px', width: 32, height: 32 }} /><p>Processing bank statement…</p></div>
            ) : (
              <>
                <div style={{ fontSize: 56, marginBottom: 14 }}>🏦</div>
                <h3 style={{ marginBottom: 8 }}>Drop Bank Statement here</h3>
                <p className="muted" style={{ marginBottom: 8 }}>Excel (.xlsx, .xls) or CSV format</p>
                <p className="muted" style={{ fontSize: 13 }}>Required columns: Date, Narration/Description, Credit/Debit, Balance</p>
              </>
            )}
          </div>

          {uploadResult && (
            <div style={{ padding: 20, borderRadius: 12, background: uploadResult.error ? '#fee2e2' : '#d1fae5', color: uploadResult.error ? '#dc2626' : '#065f46', fontSize: 14, marginBottom: 24 }}>
              {uploadResult.error ? `❌ ${uploadResult.error}` :
                `✅ Uploaded ${uploadResult.total} transactions · Matched: ${uploadResult.matched} · Partial: ${uploadResult.partial} · Unmatched: ${uploadResult.unmatched}`}
            </div>
          )}

          {/* Previous uploads */}
          {batches.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Previous Uploads</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {['File Name', 'Date', 'Rows', 'Matched', 'Unmatched', 'Credit Total'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 10).map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{b.fileName}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{new Date(b.uploadedAt).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '10px 14px' }}>{b.rowCount}</td>
                      <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{b.matchedCount}</td>
                      <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 600 }}>{b.unmatchedCount}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>₹{b.totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MATCH TAB */}
      {tab === 'match' && (
        <div>
          <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Filter:</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 140 }}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 130 }}>
              <option value="">All Chains</option>
              {chains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>{filteredRows.length} transactions</span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div> :
              filteredRows.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <p className="muted">No transactions. Upload a bank statement first.</p>
                  <button onClick={() => setTab('upload')} className="btn" style={{ marginTop: 12 }}>Upload Statement</button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Narration', 'Credit', 'Chain', 'Status', 'Matched To', 'Matched Amt', 'Pending'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Credit' || h === 'Matched Amt' || h === 'Pending' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => {
                        const st = STATUS[row.matchStatus as keyof typeof STATUS] || STATUS.UNMATCHED;
                        return (
                          <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                              {row.txnDate ? new Date(row.txnDate).toLocaleDateString('en-IN') : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.narration}>{row.narration}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                              {row.creditAmount > 0 ? `₹${row.creditAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {row.chainName ? <span style={{ background: (CHAIN_COLORS[row.chainName] || '#999') + '22', color: CHAIN_COLORS[row.chainName] || '#999', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{row.chainName}</span> : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.label}</span>
                            </td>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                              {row.matchedInvoiceNo || row.matchedPoNumber || '—'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {row.matchedAmount > 0 ? `₹${row.matchedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.pendingAmount > 0 ? '#dc2626' : '#10b981' }}>
                              {row.pendingAmount > 0 ? `₹${row.pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '✓'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Chain-wise outstanding */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>📊 Chain-wise Outstanding</h3>
              {chainStats.length === 0 ? <p className="muted">No data yet. Upload a bank statement first.</p> :
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {chainStats.map(cs => (
                    <div key={cs.chain}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: CHAIN_COLORS[cs.chain] || '#333' }}>{cs.chain}</span>
                        <span style={{ fontSize: 13 }}>
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>₹{cs.pending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          <span className="muted"> pending</span>
                        </span>
                      </div>
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cs.total > 0 ? Math.min(100, (cs.received / cs.total) * 100) : 0}%`, background: CHAIN_COLORS[cs.chain] || '#3b82f6', borderRadius: 6, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        <span>Received: ₹{cs.received.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        <span>Total: ₹{cs.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · {cs.txns} txns</span>
                      </div>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Match status breakdown */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>🎯 Match Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(STATUS).map(([key, st]) => {
                  const count = rows.filter(r => r.matchStatus === key).length;
                  const pct = rows.length > 0 ? ((count / rows.length) * 100).toFixed(1) : '0';
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{st.label}</span>
                      <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: st.color, borderRadius: 6, opacity: 0.7, transition: 'width 0.5s' }} />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{count}</span>
                      <span className="muted" style={{ fontSize: 12, minWidth: 40 }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 20, padding: '14px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Total Outstanding</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>₹{(summary.totalPending || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="muted" style={{ fontSize: 12 }}>across {summary.totalUnmatched + summary.totalPartial} unresolved transactions</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
