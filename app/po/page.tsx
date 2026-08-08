"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import UploadForm from '@/components/UploadForm';

type POItem = {
  id: string; chainItemCode: string; chainItemName: string;
  tallyItemName?: string; eanCode?: string; hsnCode?: string;
  quantityPcs: number; quantityCase: number;
  unitPrice: number; totalPrice: number;
};
type PO = {
  id: string; poNumber: string; chainName: string; status: string;
  poDate: string; appointmentDate?: string; createdAt: string; totalAmount: number;
  notes?: string; planningNote?: string;
  filePath?: string; fileName?: string; imagekitUrl?: string; rawDocumentInfo?: string;
  items: POItem[];
};

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'EASTERN', 'RELIANCE', 'VISHAL', 'OTHER'];
const CHAIN_COLORS: Record<string, string> = { FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6', BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225', DMART: '#E91B23', EASTERN: '#E41E26', RELIANCE: '#005CB9', VISHAL: '#0055A5', OTHER: '#64748b' };
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: '🟢 Active', color: '#16a34a', bg: '#dcfce7' },
  PLANNED: { label: '🔵 Planned', color: '#2563eb', bg: '#dbeafe' },
  COMPLETED: { label: '✅ Completed', color: '#6b7280', bg: '#f3f4f6' },
  REMOVED: { label: '❌ Removed', color: '#dc2626', bg: '#fee2e2' },
};

const suppliers = [
  { id: 'amazon', name: 'Amazon', color: '#FF9900' },
  { id: 'flipkart', name: 'Flipkart', color: '#2874F0' },
  { id: 'blinkit', name: 'Blinkit', color: '#F8CB46' },
  { id: 'dmart', name: 'DMart', color: '#26A541' },
  { id: 'zepto', name: 'Zepto', color: '#5B18AC' },
  { id: 'swiggy', name: 'Swiggy', color: '#FC8019' },
  { id: 'bigbasket', name: 'BigBasket', color: '#689F38' },
  { id: 'eastern', name: 'Eastern', color: '#E41E26' },
  { id: 'reliance', name: 'Reliance Retail', color: '#005CB9' },
  { id: 'vishal', name: 'Vishal Mega Mart', color: '#0055A5' },
];

function formatUploadTime(dateVal: any): string {
  if (!dateVal) return 'Recently';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export default function POPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list');
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChain, setFilterChain] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'today' | '7days' | '30days'
  const [sortBy, setSortBy] = useState('upload_desc'); // 'upload_desc' | 'upload_asc' | 'po_desc' | 'po_asc' | 'amount_desc' | 'amount_asc'

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.location.search.includes('tab=upload') || window.location.hash === '#upload')) {
      setActiveTab('upload');
    }
  }, []);

  useEffect(() => { loadPOs(); }, [filterChain, filterStatus]);

  async function loadPOs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterChain) params.set('chain', filterChain);
    if (filterStatus) params.set('status', filterStatus);
    const res = await fetch(`/api/po?${params}`);
    const data = await res.json();
    setPos(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/po/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    loadPOs();
  }

  // Filter & Sort Computation
  const filteredAndSortedPOs = pos.filter(po => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPoNumber = po.poNumber.toLowerCase().includes(q);
      const matchFileName = (po.fileName || '').toLowerCase().includes(q);
      const matchChain = po.chainName.toLowerCase().includes(q);
      const matchNotes = (po.notes || '').toLowerCase().includes(q);

      let vendorName = '';
      try {
        if (po.rawDocumentInfo) {
          const parsed = JSON.parse(po.rawDocumentInfo);
          vendorName = (parsed.vendorName || '').toLowerCase();
        }
      } catch {}

      const matchVendor = vendorName.includes(q);
      const matchItems = po.items.some(i =>
        i.chainItemCode.toLowerCase().includes(q) ||
        i.chainItemName.toLowerCase().includes(q) ||
        (i.tallyItemName && i.tallyItemName.toLowerCase().includes(q))
      );

      if (!matchPoNumber && !matchFileName && !matchChain && !matchNotes && !matchVendor && !matchItems) {
        return false;
      }
    }

    // 2. Upload Date / Time Period Filter
    if (timeFilter !== 'all') {
      const uploadDate = new Date(po.createdAt);
      const now = new Date();
      if (isNaN(uploadDate.getTime())) return true;

      if (timeFilter === 'today') {
        if (uploadDate.toDateString() !== now.toDateString()) return false;
      } else if (timeFilter === '7days') {
        const diffDays = (now.getTime() - uploadDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      } else if (timeFilter === '30days') {
        const diffDays = (now.getTime() - uploadDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 30) return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'upload_desc') {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (sortBy === 'upload_asc') {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    if (sortBy === 'po_desc') {
      return new Date(b.poDate || 0).getTime() - new Date(a.poDate || 0).getTime();
    }
    if (sortBy === 'po_asc') {
      return new Date(a.poDate || 0).getTime() - new Date(b.poDate || 0).getTime();
    }
    if (sortBy === 'amount_desc') {
      return b.totalAmount - a.totalAmount;
    }
    if (sortBy === 'amount_asc') {
      return a.totalAmount - b.totalAmount;
    }
    return 0;
  });

  const stats = {
    active: pos.filter(p => p.status === 'ACTIVE').length,
    planned: pos.filter(p => p.status === 'PLANNED').length,
    totalValue: filteredAndSortedPOs.reduce((s, p) => s + p.totalAmount, 0),
    totalItems: filteredAndSortedPOs.reduce((s, p) => s + p.items.length, 0),
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterChain('');
    setFilterStatus('ACTIVE');
    setTimeFilter('all');
    setSortBy('upload_desc');
  };

  return (
    <div className="container fade-in">
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            📦 PO Management
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Track and upload incoming Purchase Orders from Flipkart, Amazon, Zepto, Blinkit & more</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {selectedIds.size > 0 && (
            <Link href={`/shortfall?pos=${[...selectedIds].join(',')}`} className="btn"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              ⚡ Shortfall ({selectedIds.size})
            </Link>
          )}
          <Link href="/po/new" className="btn" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', whiteSpace: 'nowrap' }}>
            + New PO
          </Link>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '2px solid var(--border)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveTab('list')}
          className="btn"
          style={{
            background: activeTab === 'list' ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'var(--bg-secondary)',
            color: activeTab === 'list' ? '#fff' : 'var(--text)',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 8
          }}
        >
          📋 Active PO Records ({filteredAndSortedPOs.length})
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className="btn"
          style={{
            background: activeTab === 'upload' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'var(--bg-secondary)',
            color: activeTab === 'upload' ? '#fff' : 'var(--text)',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 8
          }}
        >
          📤 Chain / Buyer PO Uploads
        </button>
      </div>

      {activeTab === 'upload' ? (
        /* Chain / Buyer PO Uploads Section */
        <div>
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 20 }}>📤 Chain / Buyer PO Uploads</h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
                Upload PO documents from specific retail chains (Amazon, Blinkit, DMart, Zepto, Swiggy, BigBasket, Eastern, Reliance, Vishal) to auto-extract items and create PO records.
              </p>
            </div>
            <Link href="/po/new" className="btn secondary" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              👁️ Interactive PO Editor (+ Pre-review before saving)
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
            {suppliers.map(supplier => (
              <div key={supplier.id} className="card" style={{ borderLeft: `4px solid ${supplier.color}` }}>
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{supplier.name}</h3>
                    <span className="badge" style={{ backgroundColor: supplier.color, color: '#fff' }}>
                      {supplier.id.toUpperCase()} PO
                    </span>
                  </div>
                  <Link href={`/po/new?chain=${supplier.id.toUpperCase()}`} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                    Open in Interactive Editor ↗
                  </Link>
                </div>
                <UploadForm
                  preselectedVendor={supplier.id}
                  onSuccess={(createdPoId?: string) => {
                    setSearchQuery('');
                    setFilterChain('');
                    setFilterStatus('ACTIVE');
                    setTimeFilter('all');
                    setSortBy('upload_desc');
                    setActiveTab('list');
                    if (createdPoId) setExpanded(createdPoId);
                    loadPOs();
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* PO Records List View */
        <div>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Active POs', value: stats.active, color: '#16a34a', bg: 'linear-gradient(135deg,#16a34a,#15803d)' },
              { label: 'Planned', value: stats.planned, color: '#2563eb', bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)' },
              { label: 'Total Value', value: `₹${stats.totalValue.toLocaleString('en-IN')}`, color: '#9333ea', bg: 'linear-gradient(135deg,#9333ea,#7e22ce)' },
              { label: 'Total Line Items', value: stats.totalItems, color: '#ea580c', bg: 'linear-gradient(135deg,#ea580c,#c2410c)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 20, background: s.bg, border: 'none', color: '#fff' }}>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Comprehensive Search & Filter Controls */}
          <div className="card" style={{ padding: 16, marginBottom: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center' }}>

              {/* Search input */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  🔍 Search POs
                </label>
                <input
                  type="text"
                  placeholder="Search PO #, file name, vendor, SKU or product..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
              </div>

              {/* Status Filter */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  🟢 Status Filter
                </label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Chain Filter */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  🏷️ Chain Filter
                </label>
                <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <option value="">All Chains</option>
                  {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Upload Time Period Filter */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  🕒 Upload Period
                </label>
                <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <option value="all">All Upload Times</option>
                  <option value="today">Uploaded Today</option>
                  <option value="7days">Uploaded Last 7 Days</option>
                  <option value="30days">Uploaded Last 30 Days</option>
                </select>
              </div>

              {/* Sort By Selector */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  ↕️ Sort By
                </label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <option value="upload_desc">Upload Date (Newest First)</option>
                  <option value="upload_asc">Upload Date (Oldest First)</option>
                  <option value="po_desc">PO Date (Newest First)</option>
                  <option value="po_asc">PO Date (Oldest First)</option>
                  <option value="amount_desc">Total Amount (High → Low)</option>
                  <option value="amount_asc">Total Amount (Low → High)</option>
                </select>
              </div>

            </div>

            {/* Filter Summary & Reset Action Bar */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="muted">
                  Showing <strong>{filteredAndSortedPOs.length}</strong> of <strong>{pos.length}</strong> POs
                </span>
                {selectedIds.size > 0 && (
                  <span style={{ fontWeight: 600, color: '#10b981' }}>{selectedIds.size} selected for Shortfall</span>
                )}
              </div>
              {(searchQuery || filterChain || filterStatus !== 'ACTIVE' || timeFilter !== 'all' || sortBy !== 'upload_desc') && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn secondary"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  🔄 Reset Filters & Search
                </button>
              )}
            </div>
          </div>

          {/* PO Cards List */}
          {loading ? (
            <div style={{ padding: 64, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredAndSortedPOs.length === 0 ? (
            <div className="card" style={{ padding: 64, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
              <h3>No POs found</h3>
              <p className="muted" style={{ marginBottom: 24 }}>No Purchase Orders match your current search and filter settings.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={resetFilters} className="btn">🔄 Reset Filters</button>
                <Link href="/po/new" className="btn secondary">+ Add PO Manually</Link>
                <button onClick={() => setActiveTab('upload')} className="btn secondary">📤 Upload Chain PO Document</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredAndSortedPOs.map(po => {
                const st = STATUS_MAP[po.status] || STATUS_MAP.ACTIVE;
                const isExpanded = expanded === po.id;
                const isSelected = selectedIds.has(po.id);
                const uploadFormatted = formatUploadTime(po.createdAt);

                return (
                  <div key={po.id} className="card" style={{ padding: 0, overflow: 'hidden', border: `2px solid ${isSelected ? '#10b981' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : po.id)}>
                      {/* Checkbox */}
                      <input type="checkbox" checked={isSelected} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(po.id)} style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer', flex: 'none' }} />

                      {/* Chain badge */}
                      <span style={{ background: (CHAIN_COLORS[po.chainName] || '#999') + '22', color: CHAIN_COLORS[po.chainName] || '#999', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, flex: 'none' }}>{po.chainName}</span>

                      {/* PO Number, PO Date, Upload Timestamp & File link */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'monospace' }}>{po.poNumber}</span>
                          {po.imagekitUrl && (
                            <a
                              href={po.imagekitUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                fontSize: 10,
                                color: '#0284c7',
                                background: 'rgba(2, 132, 199, 0.1)',
                                padding: '2px 8px',
                                borderRadius: 10,
                                textDecoration: 'none',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title="View on ImageKit CDN"
                            >
                              ☁️ ImageKit
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span>📅 PO Date: <strong>{new Date(po.poDate).toLocaleDateString('en-IN')}</strong>{po.appointmentDate ? ` · Appt: ${new Date(po.appointmentDate).toLocaleDateString('en-IN')}` : ''}</span>
                          <span style={{ opacity: 0.85 }}>•</span>
                          <span>🕒 Uploaded: <strong>{uploadFormatted}</strong></span>
                          {po.fileName && <span style={{ color: '#2563eb', fontWeight: 500 }}>📄 {po.fileName}</span>}
                        </div>
                      </div>

                      {/* Items count */}
                      <div style={{ textAlign: 'center', flex: 'none' }}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{po.items.length}</div>
                        <div className="muted" style={{ fontSize: 11 }}>items</div>
                      </div>

                      {/* Total */}
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>₹{po.totalAmount.toLocaleString('en-IN')}</div>
                        <div className="muted" style={{ fontSize: 11 }}>total value</div>
                      </div>

                      {/* Status badge */}
                      <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, flex: 'none' }}>{st.label}</span>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flex: 'none' }} onClick={e => e.stopPropagation()}>
                        {po.status === 'ACTIVE' && <button onClick={() => updateStatus(po.id, 'PLANNED')} className="btn secondary" style={{ fontSize: 11, padding: '4px 8px' }}>Plan</button>}
                        {po.status === 'PLANNED' && <button onClick={() => updateStatus(po.id, 'COMPLETED')} className="btn secondary" style={{ fontSize: 11, padding: '4px 8px' }}>Complete</button>}
                        {po.status !== 'REMOVED' && <button onClick={() => updateStatus(po.id, 'REMOVED')} className="btn secondary" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--error)' }}>Remove</button>}
                      </div>
                      <span style={{ fontSize: 18, color: 'var(--text-secondary)', flex: 'none' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded items & document info */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '16px 20px' }}>
                        {/* Uploaded File Link & AI 16 Fields Grid */}
                        {(po.filePath || po.rawDocumentInfo || po.imagekitUrl) && (
                          <div style={{ marginBottom: 16, padding: 14, background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#1e40af' }}>🤖 AI Extracted Document Summary (16 Fields)</span>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {po.imagekitUrl && (
                                  <a
                                    href={po.imagekitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn secondary"
                                    style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', border: '1px solid rgba(2, 132, 199, 0.3)', textDecoration: 'none' }}
                                  >
                                    ☁️ View on ImageKit.io
                                  </a>
                                )}
                                {po.filePath && (
                                  <a href={po.filePath} download={po.fileName || `PO_${po.poNumber}`} className="btn secondary" style={{ fontSize: 12, padding: '4px 10px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                                    📄 Download Original File ({po.fileName || 'PO File'})
                                  </a>
                                )}
                              </div>
                            </div>
                            {po.rawDocumentInfo && (() => {
                              let info: any = {};
                              try { info = JSON.parse(po.rawDocumentInfo); } catch {}
                              return (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 12 }}>
                                  <div><strong>1. Type:</strong> {info.documentType || 'Purchase Order'}</div>
                                  <div><strong>2. PO Number:</strong> {info.documentNumber || po.poNumber}</div>
                                  <div><strong>3. PO Date:</strong> {info.documentDate || new Date(po.poDate).toLocaleDateString('en-IN')}</div>
                                  <div><strong>4. Delivery Date:</strong> {info.deliveryDate || (po.appointmentDate ? new Date(po.appointmentDate).toLocaleDateString('en-IN') : 'N/A')}</div>
                                  <div><strong>5. Vendor Name:</strong> {info.vendorName || po.chainName}</div>
                                  <div><strong>6. Vendor Address:</strong> {info.vendorAddress || 'N/A'}</div>
                                  <div><strong>7. Vendor Contact:</strong> {info.vendorContact || 'N/A'}</div>
                                  <div><strong>8. Vendor GSTIN:</strong> {info.vendorGST || 'N/A'}</div>
                                  <div><strong>9. Buyer Name:</strong> {info.buyerName || 'Bhavish CRM'}</div>
                                  <div><strong>10. Buyer Address:</strong> {info.buyerAddress || 'N/A'}</div>
                                  <div><strong>11. Buyer GSTIN:</strong> {info.buyerGST || 'N/A'}</div>
                                  <div><strong>12. Shipping Address:</strong> {info.shippingAddress || 'N/A'}</div>
                                  <div><strong>13. Payment Terms:</strong> {info.paymentTerms || 'N/A'}</div>
                                  <div><strong>14. Subtotal:</strong> ₹{info.subtotal ? Number(info.subtotal).toLocaleString('en-IN') : '0'}</div>
                                  <div><strong>15. Tax Amount:</strong> ₹{info.taxAmount ? Number(info.taxAmount).toLocaleString('en-IN') : '0'}</div>
                                  <div><strong>16. Total Amount:</strong> ₹{info.totalAmount ? Number(info.totalAmount).toLocaleString('en-IN') : po.totalAmount.toLocaleString('en-IN')}</div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['Chain Code', 'Chain Item Name', 'Tally Name', 'Qty (PCS)', 'Qty (Cases)', 'Unit Price', 'Total'].map(h => (
                                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Qty (PCS)' || h === 'Qty (Cases)' || h === 'Unit Price' || h === 'Total' ? 'right' : 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map(item => (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{item.chainItemCode}</td>
                                <td style={{ padding: '10px 16px' }}>{item.chainItemName}</td>
                                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{item.tallyItemName || <span className="muted">—</span>}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{item.quantityPcs.toLocaleString()}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>{item.quantityCase.toFixed(2)}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>₹{item.unitPrice.toLocaleString()}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>₹{item.totalPrice.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {po.notes && <div style={{ paddingTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>📝 {po.notes}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
