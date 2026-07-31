"use client";
import { useState, useRef } from 'react';
import StockTableWithDelete from '@/components/StockTableWithDelete';

export default function StockPage() {
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/stock/upload', { method: 'POST', body: fd });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.status === 504 ? 'Server timed out (504 Gateway Timeout)' : `Server error (${res.status}): ${text.slice(0, 100)}`);
      }

      if (res.ok) {
        alert(`✅ Stock updated successfully! \n${data.updatedCount} items updated.`);
        setRefreshKey(k => k + 1);
      } else {
        alert(`❌ Error: ${data.error || 'Upload failed'}`);
      }
    } catch (err: any) {
      alert(`❌ Request Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #14b8a6, #0f766e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          📦 Stock & Inventory
        </h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Upload Tally Closing Stock directly via Excel/PDF to update CRM quantities. Review uploaded stock below and delete/re-upload anytime.
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

      {/* Uploaded Stock Summary & Delete Table */}
      <StockTableWithDelete refreshKey={refreshKey} />
    </div>
  );
}
