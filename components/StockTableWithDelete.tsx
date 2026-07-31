"use client";
import { useState, useEffect } from 'react';

type StockItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  brand: string;
  group: string;
  quantity: number;
  updatedAt: string;
};

export default function StockTableWithDelete({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [totalPcs, setTotalPcs] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStockData();
  }, [refreshKey]);

  async function loadStockData() {
    setLoading(true);
    try {
      const res = await fetch('/api/import/stock');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotalPcs(data.totalPcs || 0);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteItem(id: string, name: string) {
    if (!confirm(`Delete/Reset stock for "${name}"? You can re-upload anytime.`)) return;
    try {
      const res = await fetch(`/api/import/stock?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`✅ Stock for "${name}" reset to 0 pcs`);
        loadStockData();
      } else {
        alert(data.error || 'Failed to delete stock');
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  }

  async function handleResetAll() {
    if (!confirm('⚠️ Are you sure you want to reset ALL uploaded stock quantities to 0? This allows you to perform a clean re-upload.')) return;
    try {
      const res = await fetch('/api/import/stock?resetAll=true', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setActionMessage('✅ All stock quantities reset to 0 pcs. Ready for fresh upload!');
        loadStockData();
      } else {
        alert(data.error || 'Failed to reset stock');
      }
    } catch (err: any) {
      alert('Reset failed: ' + err.message);
    }
  }

  const filtered = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.sku.toLowerCase().includes(search.toLowerCase()) ||
    i.brand.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="card" style={{ marginTop: 24, padding: 20 }}>
      {/* Header & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>📊 Uploaded Stock & PCS Summary</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Review uploaded closing stock quantities. Delete or reset items anytime to re-upload fresh files.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button 
            onClick={handleResetAll} 
            disabled={items.length === 0} 
            className="btn secondary" 
            style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: 12, padding: '6px 12px' }}
          >
            🗑️ Clear / Reset All Stock
          </button>
        </div>
      </div>

      {actionMessage && (
        <div style={{ padding: 10, borderRadius: 6, background: '#ecfdf5', color: '#047857', fontSize: 13, marginBottom: 16 }}>
          {actionMessage}
        </div>
      )}

      {/* Summary Stat Pill */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Uploaded SKUs</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{items.length}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 11, color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Total Stock Quantity (PCS)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d', marginTop: 2 }}>{totalPcs.toLocaleString('en-IN')} PCS</div>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: 16 }}>
        <input 
          placeholder="🔍 Search uploaded stock by item name, SKU or brand..." 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
        />
      </div>

      {/* Stock Table */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {search ? 'No items match your search.' : 'No stock uploaded yet. Upload a generic Excel stock file above.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ textAlign: 'left' }}>Product Name</th>
                <th style={{ textAlign: 'left' }}>SKU / Code</th>
                <th style={{ textAlign: 'left' }}>Brand</th>
                <th style={{ textAlign: 'right' }}>Quantity (PCS)</th>
                <th style={{ textAlign: 'left' }}>Last Updated</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.sku}</td>
                  <td>
                    <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                      {item.brand}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: item.quantity > 0 ? '#10b981' : '#dc2626' }}>
                    {item.quantity.toLocaleString('en-IN')} PCS
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {new Date(item.updatedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      onClick={() => handleDeleteItem(item.id, item.name)} 
                      className="btn secondary" 
                      style={{ fontSize: 11, padding: '3px 8px', color: '#dc2626' }}
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
