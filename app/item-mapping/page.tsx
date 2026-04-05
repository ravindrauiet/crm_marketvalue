"use client";
import { useState, useEffect } from 'react';

type Mapping = {
  id: string;
  chainName: string;
  chainItemCode: string;
  chainItemName: string;
  tallyItemName: string;
  tallyItemSku?: string;
  companyItemCode?: string;
  companyItemName?: string;
  pcsPerCase: number;
  notes?: string;
};

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'OTHER'];
const CHAIN_COLORS: Record<string, string> = {
  FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6',
  BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225',
  DMART: '#E91B23', OTHER: '#64748b',
};

const emptyForm = {
  chainName: 'FLIPKART', chainItemCode: '', chainItemName: '',
  tallyItemName: '', tallyItemSku: '', companyItemCode: '',
  companyItemName: '', pcsPerCase: '1', notes: ''
};

export default function ItemMappingPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterChain, setFilterChain] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadMappings(); }, [filterChain, search]);

  async function loadMappings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterChain) params.set('chain', filterChain);
    if (search) params.set('search', search);
    const res = await fetch(`/api/item-mapping?${params}`);
    const data = await res.json();
    setMappings(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await fetch(`/api/item-mapping/${editingId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
        });
      } else {
        await fetch('/api/item-mapping', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
        });
      }
      setShowModal(false); setEditingId(null); setForm(emptyForm);
      loadMappings();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this mapping?')) return;
    await fetch(`/api/item-mapping/${id}`, { method: 'DELETE' });
    loadMappings();
  }

  function openEdit(m: Mapping) {
    setForm({ chainName: m.chainName, chainItemCode: m.chainItemCode, chainItemName: m.chainItemName, tallyItemName: m.tallyItemName, tallyItemSku: m.tallyItemSku || '', companyItemCode: m.companyItemCode || '', companyItemName: m.companyItemName || '', pcsPerCase: String(m.pcsPerCase), notes: m.notes || '' });
    setEditingId(m.id);
    setShowModal(true);
  }

  return (
    <div className="container fade-in">
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 32, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🔗 Item Mapping Master
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Map chain item codes → Tally SKU → Company codes with PCS/CASE conversion
          </p>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="btn" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', whiteSpace: 'nowrap' }}>
          + Add Mapping
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {CHAINS.slice(0, 6).map(chain => {
          const count = mappings.filter(m => m.chainName === chain).length;
          return (
            <div key={chain} onClick={() => setFilterChain(filterChain === chain ? '' : chain)}
              className="card" style={{ flex: '0 0 auto', padding: '12px 18px', cursor: 'pointer', border: `2px solid ${filterChain === chain ? CHAIN_COLORS[chain] : 'var(--border)'}`, transition: 'all 0.2s', transform: filterChain === chain ? 'translateY(-2px)' : 'none' }}>
              <div style={{ fontSize: 11, color: CHAIN_COLORS[chain], fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{chain}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍 Search item name or code..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', fontSize: 13 }} />
        <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ padding: '8px 12px', minWidth: 140, fontSize: 13 }}>
          <option value="">All Chains</option>
          {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : mappings.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h3 style={{ marginBottom: 8 }}>No mappings yet</h3>
            <p className="muted" style={{ marginBottom: 24 }}>Add your first item mapping to link chain codes with Tally items.</p>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="btn">+ Add First Mapping</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th>Chain</th>
                  <th>Chain Code</th>
                  <th>Chain Name</th>
                  <th>Tally Name</th>
                  <th>Company Code</th>
                  <th style={{ textAlign: 'center' }}>PCS/Case</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id}>
                    <td>
                      <span style={{ background: CHAIN_COLORS[m.chainName] + '22', color: CHAIN_COLORS[m.chainName], padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {m.chainName}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.chainItemCode}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.chainItemName}</td>
                    <td style={{ fontWeight: 600 }}>{m.tallyItemName}</td>
                    <td className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.companyItemCode || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {m.pcsPerCase}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(m)} className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }}>Edit</button>
                        <button onClick={() => handleDelete(m.id)} className="btn secondary" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--error)' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 20 }}>{editingId ? 'Edit' : 'Add'} Item Mapping</h3>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label>Chain *</label>
                  <select value={form.chainName} onChange={e => setForm({ ...form, chainName: e.target.value })}>
                    {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label>Chain Item Code *</label>
                  <input required value={form.chainItemCode} onChange={e => setForm({ ...form, chainItemCode: e.target.value })} placeholder="e.g. B08G5QLVJ4" />
                </div>
                <div>
                  <label>Chain Item Name *</label>
                  <input required value={form.chainItemName} onChange={e => setForm({ ...form, chainItemName: e.target.value })} placeholder="Name on chain PO" />
                </div>
                <div>
                  <label>Tally Item Name *</label>
                  <input required value={form.tallyItemName} onChange={e => setForm({ ...form, tallyItemName: e.target.value })} placeholder="Exact name in Tally" />
                </div>
                <div>
                  <label>Tally SKU (optional)</label>
                  <input value={form.tallyItemSku} onChange={e => setForm({ ...form, tallyItemSku: e.target.value })} placeholder="Product SKU" />
                </div>
                <div>
                  <label>Company Item Code</label>
                  <input value={form.companyItemCode} onChange={e => setForm({ ...form, companyItemCode: e.target.value })} placeholder="Code for company order" />
                </div>
                <div>
                  <label>PCS per Case *</label>
                  <input required type="number" min="1" value={form.pcsPerCase} onChange={e => setForm({ ...form, pcsPerCase: e.target.value })} placeholder="e.g. 24" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={saving} className="btn" style={{ flex: 2, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {saving ? 'Saving…' : editingId ? 'Update Mapping' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
