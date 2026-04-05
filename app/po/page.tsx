"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type POItem = {
  id: string; chainItemCode: string; chainItemName: string;
  tallyItemName?: string; quantityPcs: number; quantityCase: number;
  unitPrice: number; totalPrice: number;
};
type PO = {
  id: string; poNumber: string; chainName: string; status: string;
  poDate: string; appointmentDate?: string; totalAmount: number;
  notes?: string; planningNote?: string; items: POItem[];
};

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'OTHER'];
const CHAIN_COLORS: Record<string, string> = { FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6', BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225', DMART: '#E91B23', OTHER: '#64748b' };
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: '🟢 Active', color: '#16a34a', bg: '#dcfce7' },
  PLANNED: { label: '🔵 Planned', color: '#2563eb', bg: '#dbeafe' },
  COMPLETED: { label: '✅ Completed', color: '#6b7280', bg: '#f3f4f6' },
  REMOVED: { label: '❌ Removed', color: '#dc2626', bg: '#fee2e2' },
};

export default function POPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChain, setFilterChain] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const stats = {
    active: pos.filter(p => p.status === 'ACTIVE').length,
    planned: pos.filter(p => p.status === 'PLANNED').length,
    totalValue: pos.reduce((s, p) => s + p.totalAmount, 0),
    totalItems: pos.reduce((s, p) => s + p.items.length, 0),
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  return (
    <div className="container fade-in">
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 28, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            📦 PO Management
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Track incoming Purchase Orders from Flipkart, Amazon, Zepto, Blinkit & more</p>
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

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Active POs', value: stats.active, color: '#16a34a', bg: 'linear-gradient(135deg,#16a34a,#15803d)' },
          { label: 'Planned', value: stats.planned, color: '#2563eb', bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)' },
          { label: 'Total Value', value: `₹${stats.totalValue.toLocaleString()}`, color: '#9333ea', bg: 'linear-gradient(135deg,#9333ea,#7e22ce)' },
          { label: 'Total Line Items', value: stats.totalItems, color: '#ea580c', bg: 'linear-gradient(135deg,#ea580c,#c2410c)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 20, background: s.bg, border: 'none', color: '#fff' }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Filter:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 130 }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, minWidth: 130 }}>
          <option value="">All Chains</option>
          {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>{pos.length} PO{pos.length !== 1 ? 's' : ''}</span>
        {selectedIds.size > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>{selectedIds.size} selected</span>}
      </div>

      {/* PO Cards */}
      {loading ? (
        <div style={{ padding: 64, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : pos.length === 0 ? (
        <div className="card" style={{ padding: 64, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h3>No POs found</h3>
          <p className="muted" style={{ marginBottom: 24 }}>Create your first PO from a chain.</p>
          <Link href="/po/new" className="btn">+ Add PO</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pos.map(po => {
            const st = STATUS_MAP[po.status] || STATUS_MAP.ACTIVE;
            const isExpanded = expanded === po.id;
            const isSelected = selectedIds.has(po.id);
            return (
              <div key={po.id} className="card" style={{ padding: 0, overflow: 'hidden', border: `2px solid ${isSelected ? '#10b981' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                <div style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : po.id)}>
                  {/* Checkbox */}
                  <input type="checkbox" checked={isSelected} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(po.id)} style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer', flex: 'none' }} />
                  {/* Chain badge */}
                  <span style={{ background: (CHAIN_COLORS[po.chainName] || '#999') + '22', color: CHAIN_COLORS[po.chainName] || '#999', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, flex: 'none' }}>{po.chainName}</span>
                  {/* PO number */}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'monospace' }}>{po.poNumber}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{new Date(po.poDate).toLocaleDateString('en-IN')}{po.appointmentDate ? ` · Appt: ${new Date(po.appointmentDate).toLocaleDateString('en-IN')}` : ''}</div>
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

                {/* Expanded items */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
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
                    {po.notes && <div style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>📝 {po.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
