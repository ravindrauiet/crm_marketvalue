"use client";
import { useState } from 'react';

export default function StockImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/import/stock', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setResult(`Imported/updated ${data.upserted} products`);
    } catch (e: any) {
      setError(e?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <label>Excel file</label>
          <input 
            type="file" 
            accept=".xls,.xlsx" 
            onChange={e => setFile(e.target.files?.[0] || null)} 
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: '1.5' }}>
            Columns detected automatically: SKU, Name, Brand, Group, Quantity
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" type="submit" disabled={loading || !file} style={{ minWidth: 140 }}>
            {loading ? (
              <>
                <span className="spinner" style={{ marginRight: 8 }}></span>
                Importing...
              </>
            ) : 'Import Stock'}
          </button>
        </div>
      </div>
      {result && (
        <div style={{ 
          padding: 12, 
          borderRadius: 8, 
          background: 'var(--success-bg)', 
          border: '1px solid rgba(63, 185, 80, 0.3)',
          color: 'var(--success)',
          fontSize: 14
        }}>
          {result}
        </div>
      )}
      {error && (
        <div style={{ 
          padding: 12, 
          borderRadius: 8, 
          background: 'var(--error-bg)', 
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: 'var(--error)',
          fontSize: 14
        }}>
          {error}
        </div>
      )}
    </form>
  );
}






