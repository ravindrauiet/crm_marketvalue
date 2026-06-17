"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';

type PO = { id: string; poNumber: string; chainName: string; status: string; totalAmount: number; items: any[] };
type ShortfallItem = {
  tallyItemName: string; totalPcs: number; totalCases: number;
  availableStock: number; shortfallPcs: number; shortfallCases: number; sources: string[];
};

const CHAIN_COLORS: Record<string, string> = { FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6', BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225', DMART: '#E91B23', OTHER: '#64748b' };

function ShortfallContent() {
  const searchParams = useSearchParams();
  const preselected = searchParams.get('pos')?.split(',').filter(Boolean) || [];

  const [activePOs, setActivePOs] = useState<PO[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselected));
  const [shortfall, setShortfall] = useState<ShortfallItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(preselected.length > 0 ? 2 : 1);
  const [showOnlyShortfall, setShowOnlyShortfall] = useState(false);

  useEffect(() => {
    fetch('/api/po?status=ACTIVE').then(r => r.json()).then(d => {
      setActivePOs(Array.isArray(d) ? d : []);
      setLoadingPOs(false);
    });
  }, []);

  async function calculateShortfall() {
    if (selectedIds.size === 0) return;
    setLoading(true); setStep(2);
    try {
      const res = await fetch('/api/shortfall', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poIds: [...selectedIds] })
      });
      const data = await res.json();
      setShortfall(data.shortfallItems || []);
      setStep(3);
    } finally { setLoading(false); }
  }

  async function generatePurchaseOrder() {
    const itemsWithShortfall = shortfall.filter(i => i.shortfallPcs > 0);
    if (itemsWithShortfall.length === 0) { alert('No shortfall items to order!'); return; }

    const confirmed = confirm(`Generate Purchase Order to Company for ${itemsWithShortfall.length} items?`);
    if (!confirmed) return;

    // Excel Export
    const poData = itemsWithShortfall.map((item, i) => ({
      'S.No': i + 1,
      'Item Name': item.tallyItemName,
      'Company Item Code': '', // Ideally we'd fetch this from mapping, but we can leave column for now
      'Order QTY (Cases)': Number(item.shortfallCases.toFixed(2)),
      'Order QTY (PCS)': item.shortfallPcs,
      'Reference POs': item.sources.join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(poData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Brand_PO');
    XLSX.writeFile(wb, `Company_PO_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const displayItems = showOnlyShortfall ? shortfall.filter(i => i.shortfallPcs > 0) : shortfall;
  const shortfallCount = shortfall.filter(i => i.shortfallPcs > 0).length;

  return (
    <div className="container fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <a href="/po" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← Back to POs</a>
        <h1 style={{ marginTop: 8, marginBottom: 4, fontSize: 28, background: 'linear-gradient(135deg, #10b981, #059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ⚡ Shortfall Calculator
        </h1>
        <p className="muted" style={{ margin: 0 }}>Select POs → Check stock → Generate purchase order to company</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'var(--bg-secondary)', borderRadius: 12, padding: 4 }}>
        {[{ n: 1, label: 'Select POs' }, { n: 2, label: 'Calculate' }, { n: 3, label: 'Review & Order' }].map(s => (
          <div key={s.n} onClick={() => s.n <= step && setStep(s.n as any)}
            style={{ flex: 1, padding: '10px 16px', textAlign: 'center', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: s.n <= step ? 'pointer' : 'default', background: step === s.n ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent', color: step === s.n ? '#fff' : step > s.n ? '#10b981' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
            {s.n < step ? '✓ ' : ''}{s.label}
          </div>
        ))}
      </div>

      {/* STEP 1: Select POs */}
      {step === 1 && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>Active Purchase Orders</strong>
              <span className="muted" style={{ fontSize: 13 }}>{selectedIds.size} selected</span>
            </div>
            {loadingPOs ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div> :
              activePOs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p className="muted">No active POs found. <Link href="/po/new" style={{ color: 'var(--primary)' }}>Create one?</Link></p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activePOs.map(po => {
                    const selected = selectedIds.has(po.id);
                    return (
                      <div key={po.id} onClick={() => { const s = new Set(selectedIds); selected ? s.delete(po.id) : s.add(po.id); setSelectedIds(s); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 10, border: `2px solid ${selected ? '#10b981' : 'var(--border)'}`, cursor: 'pointer', background: selected ? '#f0fdf4' : 'var(--bg)', transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={selected} readOnly style={{ width: 18, height: 18, accentColor: '#10b981' }} />
                        <span style={{ background: (CHAIN_COLORS[po.chainName] || '#999') + '22', color: CHAIN_COLORS[po.chainName] || '#999', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{po.chainName}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14, flex: 1 }}>{po.poNumber}</span>
                        <span className="muted" style={{ fontSize: 13 }}>{po.items.length} items</span>
                        <span style={{ fontWeight: 700 }}>₹{po.totalAmount.toLocaleString('en-IN')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={calculateShortfall} disabled={selectedIds.size === 0 || loading} className="btn"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', minWidth: 200 }}>
              ⚡ Calculate Shortfall ({selectedIds.size} POs)
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Loading */}
      {step === 2 && loading && (
        <div className="card" style={{ padding: 64, textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', width: 40, height: 40, borderWidth: 4 }} />
          <h3>Calculating shortfall…</h3>
          <p className="muted">Comparing PO requirements with current stock</p>
        </div>
      )}

      {/* STEP 3: Results */}
      {step === 3 && !loading && (
        <div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Total Items', value: shortfall.length, bg: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
              { label: 'Short Items', value: shortfallCount, bg: 'linear-gradient(135deg,#ef4444,#dc2626)' },
              { label: 'OK Items', value: shortfall.length - shortfallCount, bg: 'linear-gradient(135deg,#10b981,#059669)' },
              { label: 'POs Selected', value: selectedIds.size, bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 20, background: s.bg, border: 'none', color: '#fff' }}>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0, color: 'var(--text)' }}>
              <input type="checkbox" checked={showOnlyShortfall} onChange={e => setShowOnlyShortfall(e.target.checked)} style={{ accentColor: '#ef4444' }} />
              Show only items with shortfall
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setStep(1); setShortfall([]); }} className="btn secondary" style={{ fontSize: 13 }}>← Re-select POs</button>
            <button onClick={generatePurchaseOrder} disabled={shortfallCount === 0} className="btn"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
              🖨️ Generate Company PO ({shortfallCount} items)
            </button>
          </div>

          {/* Shortfall Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {['Item (Tally Name)', 'Required (PCS)', 'Required (Cases)', 'Available Stock', 'SHORTFALL (PCS)', 'SHORTFALL (Cases)', 'Source POs'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: h.startsWith('Required') || h.startsWith('Available') || h.startsWith('SHORT') ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, i) => {
                    const hasShortfall = item.shortfallPcs > 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: hasShortfall ? '#fff7f7' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{item.tallyItemName}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>{item.totalPcs.toLocaleString()}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>{item.totalCases.toFixed(2)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: item.availableStock === 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {item.availableStock.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {hasShortfall ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 8, fontWeight: 700 }}>{item.shortfallPcs.toLocaleString()}</span>
                            : <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ OK</span>}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {hasShortfall ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{item.shortfallCases.toFixed(2)}</span> : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {item.sources.map(s => <span key={s} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}>{s}</span>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
  return <Suspense fallback={<div className="container" style={{ padding: 64, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}><ShortfallContent /></Suspense>;
}
