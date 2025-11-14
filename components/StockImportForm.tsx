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
    <form onSubmit={onSubmit} className="row" style={{ alignItems: 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        <label>Excel file</label>
        <input type="file" accept=".xls,.xlsx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Columns detected automatically: SKU, Name, Brand, Group, Quantity</div>
      </div>
      <button className="btn" type="submit" disabled={loading || !file}>{loading ? 'Importing...' : 'Import Stock'}</button>
      {result && <div className="muted">{result}</div>}
      {error && <div className="muted" style={{ color: '#ff7a7a' }}>{error}</div>}
    </form>
  );
}






