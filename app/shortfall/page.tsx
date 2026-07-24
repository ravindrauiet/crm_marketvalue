"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';

type PO = { id: string; poNumber: string; chainName: string; status: string; totalAmount: number; items: any[] };
type ShortfallItem = {
  chainItemCode: string;
  chainItemName: string;
  chainName: string;
  brandName?: string;
  tallyItemName: string;
  eanCode?: string;
  companyItemCode?: string;
  companyItemName?: string;
  pcsPerCase: number;
  reqPcs: number;
  reqCase: number;
  availableStock: number;
  shortfallPcs: number;
  shortfallCases: number;
  sourcePo: string;
  appointmentDate?: string;
  location: string;
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
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDate, setReviewDate] = useState('');
  const [reviewLocation, setReviewLocation] = useState('TOTAL');

  useEffect(() => {
    fetch('/api/po').then(r => r.json()).then(d => {
      const filtered = Array.isArray(d) ? d.filter((po: any) => po.status !== 'REMOVED') : [];
      setActivePOs(filtered);
      setLoadingPOs(false);
    });
  }, []);

  useEffect(() => {
    const posParam = searchParams.get('pos');
    const posArray = posParam?.split(',').filter(Boolean) || [];
    if (posArray.length > 0) {
      const runCalc = async () => {
        setLoading(true);
        setStep(2);
        try {
          const res = await fetch('/api/shortfall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poIds: posArray })
          });
          const data = await res.json();
          setShortfall(data.shortfallItems || []);
          setStep(2);
        } catch (err) {
          console.error(err);
          setStep(1);
        } finally {
          setLoading(false);
        }
      };
      runCalc();
    }
  }, [searchParams]);

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
      setStep(2);
    } finally { setLoading(false); }
  }

  async function generatePurchaseOrderExcel() {
    const itemsWithShortfall = shortfall.filter(i => i.shortfallPcs > 0);
    if (itemsWithShortfall.length === 0) { alert('No shortfall items to order!'); return; }

    const confirmed = confirm(`Export Excel for ${itemsWithShortfall.length} shortfall items?`);
    if (!confirmed) return;

    // Excel Export Data (all 16 fields)
    const poData = itemsWithShortfall.map((item, i) => ({
      'S.No': i + 1,
      'Chain Item Code': item.chainItemCode || '—',
      'Chain Item Name': item.chainItemName || '—',
      'Chain': item.chainName || '—',
      'BRAND': item.brandName || '—',
      'Tally Item Name': item.tallyItemName || '—',
      'EAN Code': item.eanCode || '—',
      'Company Item Code (optional)': item.companyItemCode || '—',
      'Company Item Code/Name*': item.companyItemName || '—',
      'PCS per Case *': item.pcsPerCase,
      'REQ.(PCS)': item.reqPcs,
      'REQUIRED (CASE)': Number(item.reqCase.toFixed(2)),
      'Available Stock': item.availableStock,
      'Shortfall-PCS': item.shortfallPcs,
      'Shortfall-CASE': item.shortfallCases,
      'Source PO': item.sourcePo || '—',
      'Appointment Date': item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString('en-IN') : '—',
      'Location': item.location || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(poData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Brand_PO');
    XLSX.writeFile(wb, `Company_PO_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function generatePurchaseOrderPDF() {
    const itemsWithShortfall = shortfall.filter(i => i.shortfallPcs > 0);
    if (itemsWithShortfall.length === 0) { alert('No shortfall items to export!'); return; }

    const confirmed = confirm(`Export PDF for ${itemsWithShortfall.length} shortfall items?`);
    if (!confirmed) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups for this site to generate PDF.');
      return;
    }

    const uniquePos = [...new Set(itemsWithShortfall.map(i => i.sourcePo))].join(', ');
    const apptDate = itemsWithShortfall[0]?.appointmentDate 
      ? new Date(itemsWithShortfall[0].appointmentDate).toLocaleDateString('en-IN') 
      : '—';
    const deliveryLocation = itemsWithShortfall[0]?.location || '—';

    printWindow.document.write(`
      <html>
        <head>
          <title>Company Purchase Order - ${new Date().toISOString().slice(0, 10)}</title>
          <style>
            @page { size: landscape; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; background-color: #fff; margin: 0; }
            h1 { margin-bottom: 8px; font-size: 24px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
            .meta { font-size: 13px; color: #475569; margin-bottom: 20px; line-height: 1.6; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; background-color: #f8fafc; padding: 12px 16px; borderRadius: 8px; border: 1px solid #e2e8f0; }
            .meta-item { display: flex; flexDirection: column; }
            .meta-label { font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
            .meta-value { font-weight: 600; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold; text-align: left; color: #475569; text-transform: uppercase; font-size: 10px; }
            td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            .right { text-align: right; }
            .center { text-align: center; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .has-shortfall { background-color: #fef2f2 !important; }
            @media print {
              body { padding: 0; }
              @page { size: landscape; margin: 10mm; }
            }
          </style>
        </head>
        <body>
          <h1>📦 Company Purchase Order</h1>
          <div class="meta">
            <div class="meta-item">
              <span class="meta-label">Date</span>
              <span class="meta-value">${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="meta-item" style="grid-column: span 2;">
              <span class="meta-label">Source POs</span>
              <span class="meta-value">${uniquePos}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Appointment Date</span>
              <span class="meta-value">${apptDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Delivery Location</span>
              <span class="meta-value">${deliveryLocation}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="center">#</th>
                <th>Chain Item Code</th>
                <th>Chain Item Name</th>
                <th>Chain</th>
                <th>Brand</th>
                <th>Tally Item Name</th>
                <th>EAN Code</th>
                <th>Company Item Code</th>
                <th>Company Item Name</th>
                <th class="right">PCS per Case</th>
                <th class="right">REQ.(PCS)</th>
                <th class="right">REQ.(CASE)</th>
                <th class="right">Available Stock</th>
                <th class="right">Shortfall-PCS</th>
                <th class="right">Shortfall-CASE</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              ${itemsWithShortfall.map((item, i) => `
                <tr class="${item.shortfallPcs > 0 ? 'has-shortfall' : ''}">
                  <td class="center" style="font-weight: 600;">${i + 1}</td>
                  <td style="font-family: monospace;">${item.chainItemCode || '—'}</td>
                  <td>${item.chainItemName || '—'}</td>
                  <td>${item.chainName || '—'}</td>
                  <td>${item.brandName || '—'}</td>
                  <td style="font-weight: 600;">${item.tallyItemName || '—'}</td>
                  <td style="font-family: monospace;">${item.eanCode || '—'}</td>
                  <td style="font-family: monospace;">${item.companyItemCode || '—'}</td>
                  <td>${item.companyItemName || '—'}</td>
                  <td class="right" style="font-weight: 600;">${item.pcsPerCase}</td>
                  <td class="right">${item.reqPcs}</td>
                  <td class="right">${item.reqCase.toFixed(2)}</td>
                  <td class="right" style="font-weight: 600; color: ${item.availableStock === 0 ? '#dc2626' : '#16a34a'};">${item.availableStock}</td>
                  <td class="right" style="font-weight: 700; color: #dc2626;">${item.shortfallPcs}</td>
                  <td class="right" style="font-weight: 700; color: #dc2626;">${item.shortfallCases}</td>
                  <td>${item.location || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function openReviewModal() {
    const firstWithDate = shortfall.find(i => i.appointmentDate);
    if (firstWithDate?.appointmentDate) {
      setReviewDate(firstWithDate.appointmentDate.slice(0, 10));
    } else {
      setReviewDate(new Date().toISOString().slice(0, 10));
    }
    const firstWithLoc = shortfall.find(i => i.location);
    setReviewLocation(firstWithLoc?.location || 'TOTAL');
    setShowReviewModal(true);
  }

  function handleConfirmReview(e: React.FormEvent) {
    e.preventDefault();
    const updated = shortfall.map(item => ({
      ...item,
      appointmentDate: reviewDate ? new Date(reviewDate).toISOString() : undefined,
      location: reviewLocation
    }));
    setShortfall(updated);
    setShowReviewModal(false);
    setStep(3);
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

      {/* STEP 2 or 3: Results & Table */}
      {(step === 2 || step === 3) && !loading && shortfall.length > 0 && (
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
            {step === 2 ? (
              <>
                <button onClick={() => { setStep(1); setShortfall([]); }} className="btn secondary" style={{ fontSize: 13 }}>← Re-select POs</button>
                <button onClick={openReviewModal} className="btn" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  📋 Review
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep(2)} className="btn secondary" style={{ fontSize: 13 }}>← Back to Details</button>
                <button onClick={generatePurchaseOrderExcel} disabled={shortfallCount === 0} className="btn"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', whiteSpace: 'nowrap' }}>
                  📥 Export Excel ({shortfallCount})
                </button>
                <button onClick={generatePurchaseOrderPDF} disabled={shortfallCount === 0} className="btn"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', whiteSpace: 'nowrap' }}>
                  📄 Export PDF ({shortfallCount})
                </button>
              </>
            )}
          </div>

          {/* Shortfall Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>#</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Chain Item Code</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Chain Item Name</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Chain</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Brand</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Tally Item Name</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>EAN Code</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Company Item Code (optional)</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Company Item Code/Name*</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>PCS per Case *</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>REQ.(PCS)</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>REQUIRED (CASE)</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Available Stock</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Shortfall-PCS</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Shortfall-CASE</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Source PO</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Appointment Date</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, i) => {
                    const hasShortfall = item.shortfallPcs > 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: hasShortfall ? '#fff7f7' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>{i + 1}</td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12 }}>{item.chainItemCode}</td>
                        <td style={{ padding: '12px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.chainItemName}>{item.chainItemName}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ background: (CHAIN_COLORS[item.chainName] || '#999') + '22', color: CHAIN_COLORS[item.chainName] || '#999', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                            {item.chainName}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {item.brandName ? (
                            <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{item.brandName}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.tallyItemName}>{item.tallyItemName}</td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12 }}>{item.eanCode || '—'}</td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{item.companyItemCode || '—'}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.companyItemName || undefined}>{item.companyItemName || '—'}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>{item.pcsPerCase}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>{item.reqPcs.toLocaleString()}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>{item.reqCase.toFixed(2)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: item.availableStock === 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {item.availableStock.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {hasShortfall ? (
                            <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 8, fontWeight: 700 }}>{item.shortfallPcs.toLocaleString()}</span>
                          ) : (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ OK</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {hasShortfall ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{item.shortfallCases}</span>
                          ) : (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ OK</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>{item.sourcePo}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}>
                            {item.location}
                          </span>
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

      {/* Review Modal */}
      {showReviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '32px 16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
            <h3 style={{ marginBottom: 20 }}>Review Shipment Details</h3>
            <form onSubmit={handleConfirmReview}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Appointment Date *</label>
                  <input required type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Location *</label>
                  <input required type="text" value={reviewLocation} onChange={e => setReviewLocation(e.target.value)} placeholder="e.g. TOTAL, WAREHOUSE-A" style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => setShowReviewModal(false)} className="btn secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn" style={{ flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)' }}>Confirm & Proceed</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShortfallPage() {
  return <Suspense fallback={<div className="container" style={{ padding: 64, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}><ShortfallContent /></Suspense>;
}
