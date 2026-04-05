"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'OTHER'];

type LineItem = {
  chainItemCode: string;
  chainItemName: string;
  quantityPcs: string;
  unitPrice: string;
};

type Mapping = { chainItemCode: string; chainItemName: string; tallyItemName: string; pcsPerCase: number };

export default function NewPOPage() {
  const router = useRouter();
  const [form, setForm] = useState({ poNumber: '', chainName: 'FLIPKART', poDate: '', appointmentDate: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([{ chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load mappings for the selected chain for autocomplete
    fetch(`/api/item-mapping?chain=${form.chainName}`).then(r => r.json()).then(d => setMappings(Array.isArray(d) ? d : []));
  }, [form.chainName]);

  const addItem = () => setItems([...items, { chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: val };
    // Auto-fill name from mapping on code change
    if (field === 'chainItemCode') {
      const mapping = mappings.find(m => m.chainItemCode === val);
      if (mapping) updated[i].chainItemName = mapping.chainItemName;
    }
    setItems(updated);
  };

  const total = items.reduce((s, i) => s + (parseFloat(i.quantityPcs || '0') * parseFloat(i.unitPrice || '0')), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.poNumber.trim()) { setError('PO Number is required'); return; }
    if (items.every(i => !i.chainItemCode)) { setError('Add at least one item'); return; }

    setSaving(true); setError('');
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items: items.filter(i => i.chainItemCode).map(i => ({ ...i, quantityPcs: parseInt(i.quantityPcs) || 0, unitPrice: parseFloat(i.unitPrice) || 0 }))
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create PO'); return; }
      router.push('/po');
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="container fade-in">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <a href="/po" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>← Back to POs</a>
          <h1 style={{ marginTop: 8, marginBottom: 4, fontSize: 26, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            📦 New Purchase Order
          </h1>
          <p className="muted" style={{ margin: 0 }}>Enter PO details received from the chain</p>
        </div>

        {error && <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Header section */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>PO Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <label>PO Number *</label>
                <input required value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} placeholder="e.g. FK-PO-2024-001" />
              </div>
              <div>
                <label>Chain *</label>
                <select value={form.chainName} onChange={e => setForm({ ...form, chainName: e.target.value })}>
                  {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>PO Date</label>
                <input type="date" value={form.poDate} onChange={e => setForm({ ...form, poDate: e.target.value })} />
              </div>
              <div>
                <label>Appointment / Delivery Date</label>
                <input type="date" value={form.appointmentDate} onChange={e => setForm({ ...form, appointmentDate: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any special instructions..." style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Line Items</h3>
              <button type="button" onClick={addItem} className="btn secondary" style={{ fontSize: 13, padding: '6px 14px' }}>+ Add Row</button>
            </div>

            {mappings.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 16 }}>
                💡 {mappings.length} mappings found for {form.chainName} — type a chain code to auto-fill name
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['#', 'Chain Item Code', 'Item Name', 'Qty (PCS)', 'Unit Price (₹)', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input list={`codes-${i}`} value={item.chainItemCode} onChange={e => updateItem(i, 'chainItemCode', e.target.value)}
                          placeholder="Item code" style={{ width: '100%', padding: '6px 8px', fontSize: 13 }} />
                        <datalist id={`codes-${i}`}>
                          {mappings.map(m => <option key={m.chainItemCode} value={m.chainItemCode}>{m.chainItemName}</option>)}
                        </datalist>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input value={item.chainItemName} onChange={e => updateItem(i, 'chainItemName', e.target.value)}
                          placeholder="Item name" style={{ width: '100%', padding: '6px 8px', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" min="0" value={item.quantityPcs} onChange={e => updateItem(i, 'quantityPcs', e.target.value)}
                          placeholder="0" style={{ width: 90, padding: '6px 8px', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                          placeholder="0.00" style={{ width: 100, padding: '6px 8px', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '8px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                        ₹{(parseFloat(item.quantityPcs || '0') * parseFloat(item.unitPrice || '0')).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 16 }}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>Total PO Value:</td>
                    <td style={{ padding: '12px 8px', fontWeight: 700, fontSize: 16 }}>₹{total.toLocaleString('en-IN')}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <a href="/po" className="btn secondary">Cancel</a>
            <button type="submit" disabled={saving} className="btn"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', minWidth: 160 }}>
              {saving ? 'Saving…' : '📦 Save PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
