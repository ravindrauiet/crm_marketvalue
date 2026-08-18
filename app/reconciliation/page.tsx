"use client";
import { useState, useEffect, useRef } from 'react';

type RecoRow = {
  id: string;
  txnDate?: string;
  narration: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  bankRef?: string;
  matchStatus: string;
  matchedInvoiceNo?: string;
  matchedPoNumber?: string;
  matchedAmount: number;
  pendingAmount: number;
  chainName?: string;
  deductionAmount: number;
  deductionReason?: string;
  notes?: string;
};

type Batch = {
  id: string;
  fileName: string;
  uploadedAt: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  totalCredit: number;
  totalDebit: number;
  imagekitUrl?: string;
  notes?: string;
};

type Summary = {
  totalCredit: number;
  totalMatched: number;
  totalPartial: number;
  totalUnmatched: number;
  totalPending: number;
};

const STATUS = {
  MATCHED: { label: '✅ Matched', color: '#065f46', bg: '#d1fae5' },
  PARTIAL: { label: '🟡 Partial', color: '#92400e', bg: '#fef3c7' },
  UNMATCHED: { label: '❌ Unmatched', color: '#991b1b', bg: '#fee2e2' },
  IGNORED: { label: '⏭ Ignored', color: '#6b7280', bg: '#f3f4f6' },
};

const CHAIN_COLORS: Record<string, string> = {
  RELIANCE: '#004B93',
  FLIPKART: '#F7CA41',
  AMAZON: '#FF9900',
  ZEPTO: '#8C5CF6',
  BLINKIT: '#0FA956',
  HSBC: '#DB0011',
  SWIGGY: '#FC8019',
  BIGBASKET: '#84C225',
  DMART: '#E91B23',
  CITYMALL: '#E11D48',
  DEERIKA: '#CA8A04',
  OTHER: '#64748b',
};

export default function ReconciliationPage() {
  const [tab, setTab] = useState<'upload' | 'match' | 'dashboard'>('upload');
  const [rows, setRows] = useState<RecoRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalCredit: 0, totalMatched: 0, totalPartial: 0, totalUnmatched: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedChain, setSelectedChain] = useState('AUTO');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChain, setFilterChain] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);

  const fileVendorRef = useRef<HTMLInputElement>(null);
  const fileTallyRef = useRef<HTMLInputElement>(null);
  const fileBankRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, [filterStatus, filterChain]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/reconciliation?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setBatches(Array.isArray(data.batches) ? data.batches : []);
      setSummary(data.summary || {});
    } catch (err) {
      console.error('Failed to load reco data', err);
    }
    setLoading(false);
  }

  async function uploadFile(file: File, statementType: 'vendor' | 'tally' | 'bank' = 'bank') {
    if (!file) return;
    setUploading(true); setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('statementType', statementType);
    fd.append('chainName', selectedChain !== 'AUTO' ? selectedChain : 'OTHER');

    try {
      const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: fd });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.status === 504 ? 'Server timed out (504 Gateway Timeout)' : `Server error (${res.status}): ${text.slice(0, 100)}`);
      }

      if (res.ok) {
        setUploadResult({ ...data, success: true, statementType });
        await loadData();
        setTab('match');
      } else {
        setUploadResult({ error: data.error || 'Upload failed' });
      }
    } catch (err: any) {
      setUploadResult({ error: err.message });
    }
    setUploading(false);
  }

  async function handleResetAllReco() {
    if (!confirm('⚠️ Are you sure you want to clear/reset ALL reconciliation statement data and batches?')) return;
    try {
      const res = await fetch('/api/reconciliation?resetAll=true', { method: 'DELETE' });
      if (res.ok) {
        setUploadResult({ success: true, message: 'All reconciliation statement data cleared successfully' });
        await loadData();
      } else {
        alert('Failed to reset reconciliation data');
      }
    } catch (err: any) {
      alert('Reset failed: ' + err.message);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('⚠️ Are you sure you want to delete this batch and all its extracted records?')) return;
    try {
      const res = await fetch(`/api/reconciliation?batchId=${batchId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadData();
      } else {
        alert('Failed to delete batch');
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  }

  const filteredRows = rows.filter(r => {
    const matchesStatus = !filterStatus || r.matchStatus === filterStatus;
    const matchesChain = !filterChain || r.chainName === filterChain;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      (r.narration && r.narration.toLowerCase().includes(q)) ||
      (r.matchedInvoiceNo && r.matchedInvoiceNo.toLowerCase().includes(q)) ||
      (r.matchedPoNumber && r.matchedPoNumber.toLowerCase().includes(q)) ||
      (r.bankRef && r.bankRef.toLowerCase().includes(q)) ||
      (r.deductionReason && r.deductionReason.toLowerCase().includes(q));

    return matchesStatus && matchesChain && matchesSearch;
  });

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
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            💰 Payment & Statement Reconciliation
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Upload Payment Advices (PDF/Excel), Retail Chain Settlement Ledgers & Bank Statements → Chain-Specific AI Extraction & Auto Set-Off
          </p>
        </div>

        {rows.length > 0 && (
          <button
            onClick={handleResetAllReco}
            className="btn secondary"
            style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: 13 }}
          >
            🗑️ Clear / Reset Reco Data
          </button>
        )}
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

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--bg-secondary)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'upload', label: '📤 Upload Statements & Advices' },
          { id: 'match', label: `🔗 Match Rows & Set-Off (${rows.length})` },
          { id: 'dashboard', label: '📊 Chain Analytics' }
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className="btn" style={{ background: tab === t.id ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, padding: '8px 20px', boxShadow: 'none', border: 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* UPLOAD TAB */}
      {tab === 'upload' && (
        <div>
          {/* Chain Selection Box */}
          <div className="card" style={{ padding: 16, marginBottom: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>🏷️ Target Retail Chain / Format:</span>
              <select
                value={selectedChain}
                onChange={e => setSelectedChain(e.target.value)}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid #3b82f6', background: 'var(--bg)', minWidth: 240 }}
              >
                <option value="AUTO">🪄 Auto-Detect Chain (Recommended)</option>
                <option value="RELIANCE">🛒 Reliance Retail Payment Advice</option>
                <option value="AMAZON">📦 Amazon EFT Remittance Advice</option>
                <option value="BLINKIT">⚡ Blinkit Payment Advice</option>
                <option value="ZEPTO">🟣 Zepto Payment Advice</option>
                <option value="HSBC">🏦 HSBC Bank Payment Advice</option>
                <option value="SWIGGY">🛵 Swiggy / Instamart Advice</option>
                <option value="FLIPKART">🛍️ Flipkart Settlement Advice</option>
                <option value="BIGBASKET">🟢 BigBasket Settlement Advice</option>
                <option value="DMART">🏪 DMart Payment Advice</option>
              </select>
              <span className="muted" style={{ fontSize: 12 }}>
                {selectedChain === 'AUTO' ? 'AI will inspect document text and headers to auto-identify the chain.' : `AI parser locked to specialized ${selectedChain} extraction rules.`}
              </span>
            </div>
          </div>

          {uploading && (
            <div className="card" style={{ padding: 24, marginBottom: 24, background: 'linear-gradient(135deg, #e0f2fe, #f0f9ff)', border: '1px solid #7dd3fc', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8, animation: 'spin 2s linear infinite' }}>🤖</div>
              <h3 style={{ margin: 0, color: '#0369a1', fontSize: 18 }}>AI Extracting Payment Advice using {selectedChain} Rules...</h3>
              <p style={{ margin: '6px 0 0 0', color: '#0284c7', fontSize: 13 }}>
                Reading PDF tables, document reference numbers, invoice numbers, TDS deductions, and matching with database POs...
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
            
            {/* Card 1: Vendor / Debtor Payment Advice Upload */}
            <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>📑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>1. Upload Payment Advice / Remittance</h3>
                  <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    AI-POWERED CHAIN PARSER (PDF, XLSX, CSV)
                  </span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Upload payment advice or settlement advice PDF from Reliance, Blinkit, Zepto, Amazon, Swiggy, HSBC, etc.
              </p>
              <input
                ref={fileVendorRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'vendor'); e.target.value = ''; }}
              />
              <button
                className="btn"
                onClick={() => fileVendorRef.current?.click()}
                disabled={uploading}
                style={{ width: '100%', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
              >
                {uploading ? 'Processing Advice...' : '📤 Select Payment Advice PDF / Excel'}
              </button>
            </div>

            {/* Card 2: Tally Internal Ledger Upload */}
            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>📊</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>2. Upload Tally Statement</h3>
                  <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    TALLY INTERNAL LEDGER
                  </span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Upload internal Tally ledger or sales/receipt register (XLSX, XLS, CSV, PDF).
              </p>
              <input
                ref={fileTallyRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'tally'); e.target.value = ''; }}
              />
              <button
                className="btn"
                onClick={() => fileTallyRef.current?.click()}
                disabled={uploading}
                style={{ width: '100%', background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {uploading ? 'Processing Statement...' : '📤 Select Tally Statement'}
              </button>
            </div>

            {/* Card 3: Bank Account Statement Upload */}
            <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>🏦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>3. Upload Bank Statement</h3>
                  <span style={{ fontSize: 11, background: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    BANK ACCOUNT STATEMENT
                  </span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Upload bank statement or bank transaction advice (Excel, CSV, PDF).
              </p>
              <input
                ref={fileBankRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'bank'); e.target.value = ''; }}
              />
              <button
                className="btn"
                onClick={() => fileBankRef.current?.click()}
                disabled={uploading}
                style={{ width: '100%', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
              >
                {uploading ? 'Processing Statement...' : '📤 Select Bank Statement'}
              </button>
            </div>

          </div>

          {uploadResult && (
            <div style={{ padding: 20, borderRadius: 12, background: uploadResult.error ? '#fee2e2' : '#d1fae5', color: uploadResult.error ? '#dc2626' : '#065f46', fontSize: 14, marginBottom: 24 }}>
              {uploadResult.error ? `❌ ${uploadResult.error}` : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    ✅ Upload & Chain AI Extraction Complete! (Chain: <span style={{ textTransform: 'uppercase' }}>{uploadResult.detectedChain || 'OTHER'}</span>)
                  </div>
                  <div>
                    Extracted <strong>{uploadResult.total || 0}</strong> transaction records · Matched: <strong>{uploadResult.matched || 0}</strong> · Partial: <strong>{uploadResult.partial || 0}</strong> · Unmatched: <strong>{uploadResult.unmatched || 0}</strong>
                  </div>
                  {uploadResult.summary?.paymentRefNo && (
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      Payment Ref / UTR: <strong>{uploadResult.summary.paymentRefNo}</strong> | Payee: <strong>{uploadResult.summary.payeeName || 'N/A'}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Batches Table */}
          {batches.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Uploaded Statement Batches ({batches.length})</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {['File Name', 'Chain / Type', 'Upload Date', 'Rows', 'Matched', 'Unmatched', 'Total Amount', 'Action'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Action' ? 'center' : 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 15).map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                        {b.imagekitUrl ? (
                          <a href={b.imagekitUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'none' }}>
                            📄 {b.fileName}
                          </a>
                        ) : b.fileName}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {b.notes || 'BANK STATEMENT'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{new Date(b.uploadedAt).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '10px 14px' }}>{b.rowCount}</td>
                      <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{b.matchedCount}</td>
                      <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 600 }}>{b.unmatchedCount}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>₹{b.totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteBatch(b.id)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}
                          title="Delete Batch"
                        >
                          🗑️
                        </button>
                      </td>
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
            <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Search & Filter:</span>
            
            <input
              type="text"
              placeholder="🔍 Search Invoice #, PO #, Narration..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, minWidth: 220, borderRadius: 8, border: '1px solid var(--border)' }}
            />

            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 140, borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 130, borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="">All Chains</option>
              {chains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <div style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>Showing <strong>{filteredRows.length}</strong> of {rows.length} rows</span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Chain</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>PO / Invoice #</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Description / Narration</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Gross Amount</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>TDS / Deductions</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Set-Off / Matched</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Pending / Diff</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No reconciliation rows found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(row => {
                      const st = STATUS[row.matchStatus as keyof typeof STATUS] || STATUS.UNMATCHED;
                      const grossAmt = row.creditAmount > 0 ? row.creditAmount : row.debitAmount;
                      const chainColor = CHAIN_COLORS[row.chainName || 'OTHER'] || '#64748b';

                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            {row.txnDate ? new Date(row.txnDate).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {row.chainName ? (
                              <span style={{ background: chainColor + '20', color: chainColor, border: `1px solid ${chainColor}40`, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                                {row.chainName}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {row.matchedPoNumber ? (
                              <div style={{ color: '#0284c7' }}>PO: {row.matchedPoNumber}</div>
                            ) : null}
                            {row.matchedInvoiceNo ? (
                              <div style={{ color: '#4f46e5' }}>INV: {row.matchedInvoiceNo}</div>
                            ) : null}
                            {!row.matchedPoNumber && !row.matchedInvoiceNo && '—'}
                          </td>
                          <td style={{ padding: '10px 14px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.narration}>
                            {row.narration}
                            {row.bankRef && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ref: {row.bankRef}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                            ₹{grossAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#d97706', fontWeight: 500 }}>
                            {row.deductionAmount > 0 ? `₹${row.deductionAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>
                            ₹{row.matchedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: row.pendingAmount > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                            ₹{row.pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>📊 Chain-wise Payment & Outstanding Overview</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Chain Name</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Transactions</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Claimed / Received</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Matched & Set-Off</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Outstanding / Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {chainStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No chain data available. Upload statement files to view analytics.
                      </td>
                    </tr>
                  ) : (
                    chainStats.map(s => {
                      const color = CHAIN_COLORS[s.chain] || '#64748b';
                      return (
                        <tr key={s.chain} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                            <span style={{ color }}>{s.chain}</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>{s.txns}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>₹{s.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>₹{s.received.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>₹{s.pending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
