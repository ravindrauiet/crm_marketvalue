"use client";
import { useState, useRef, useEffect } from 'react';

export default function StockPage() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadStocks(); }, []);

  async function loadStocks() {
    setLoading(true);
    // Since we don't have a GET /api/stock, we can create one quickly or just show upload.
    // For MVP, we'll fetch products that have stock > 0 via a generic fetch or leave it.
    // I'll make a quick call to /api/products if it exists or empty array.
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setStocks(data);
      }
    } catch {
      setStocks([]);
    }
    setLoading(false);
  }

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/stock/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Stock updated successfully! \n${data.updatedCount} items updated.`);
        loadStocks(); // reload stock
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ Request Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  const filteredStocks = stocks.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()) || s.sku?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #14b8a6, #0f766e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          📦 Stock & Inventory
        </h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Upload Tally Closing Stock directly via Excel to update CRM quantities.
        </p>
      </div>

      <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
        onClick={() => fileRef.current?.click()}
        className="card" style={{ marginBottom: 24, padding: 40, textAlign: 'center', cursor: 'pointer', border: `2px dashed ${dragOver ? '#14b8a6' : 'var(--border)'}`, background: dragOver ? '#f0fdfa' : 'var(--bg-secondary)', transition: 'all 0.2s' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
        {uploading ? (
          <div><div className="spinner" style={{ margin: '0 auto 12px' }} /><p>Processing Tally Stock…</p></div>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <h3 style={{ marginBottom: 8 }}>Drop Tally Closing Stock Here</h3>
            <p className="muted" style={{ margin: 0 }}>Excel, CSV, or PDF format</p>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input placeholder="🔍 Search inventory..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', fontSize: 13 }} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
           <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 11 }}>Item Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 11 }}>SKU / Code</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 11 }}>Current Stock (PCS)</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((p: any) => {
                  const qty = p.stocks?.[0]?.quantity || 0;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{p.sku}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: qty > 0 ? '#10b981' : '#dc2626' }}>
                        {qty}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredStocks.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No stock data. Upload a closing stock file to update.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
