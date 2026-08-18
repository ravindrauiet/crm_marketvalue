"use client";
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

type Mapping = {
  id: string;
  chainName: string;
  chainItemCode: string;
  chainItemName: string;
  tallyItemName: string;
  tallyItemSku?: string;
  eanCode?: string;
  brandName?: string;
  companyItemCode?: string;
  companyItemName?: string;
  pcsPerCase: number;
  notes?: string;
};

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'CITYMALL', 'DEERIKA', 'VISHAL', 'OTHER'];
const CHAIN_COLORS: Record<string, string> = {
  FLIPKART: '#F7CA41', AMAZON: '#FF9900', ZEPTO: '#8C5CF6',
  BLINKIT: '#0FA956', SWIGGY: '#FC8019', BIGBASKET: '#84C225',
  DMART: '#E91B23', CITYMALL: '#E11D48', DEERIKA: '#CA8A04', VISHAL: '#0055A5', OTHER: '#64748b',
};

const emptyForm = {
  chainName: 'FLIPKART', chainItemCode: '', chainItemName: '',
  tallyItemName: '', tallyItemSku: '', eanCode: '', brandName: '',
  companyItemCode: '', companyItemName: '', pcsPerCase: '1', notes: ''
};

export default function ItemMappingPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterChain, setFilterChain] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadMappings(); }, [filterChain, filterBrand, search]);

  function downloadSampleExcel() {
    const sampleData = [
      {
        "Chain Name": "AMAZON",
        "Chain Item Code": "B08G5QLVJ4",
        "Chain Item Name": "Mother's Recipe Rice Papad Jeera Pouch,75 Gram",
        "Tally Item Name": "Mother's Recipe Rice Papad Jeera 75g",
        "Tally Item SKU": "SKU-PAPAD-001",
        "EAN Code": "8906001053453",
        "Brand Name": "Mother's Recipe",
        "Company Item Code": "MR-PAPAD-JEERA-75G",
        "Company Item Name": "Mother's Recipe Rice Papad Jeera Pouch 75g",
        "PCS Per Case": 24,
        "Notes": "Sample mapping for Amazon"
      },
      {
        "Chain Name": "VISHAL",
        "Chain Item Code": "1310000368",
        "Chain Item Name": "MTHRS-PKL-MXD-500G 24PK-PP",
        "Tally Item Name": "Mother's Recipe Mixed Pickle 500g",
        "Tally Item SKU": "SKU-PKL-500G",
        "EAN Code": "48003425",
        "Brand Name": "Mother's Recipe",
        "Company Item Code": "MR-PKL-MXD-500G",
        "Company Item Name": "Mother's Recipe Mixed Pickle Jar 500g",
        "PCS Per Case": 24,
        "Notes": "Sample mapping for Vishal Mega Mart"
      },
      {
        "Chain Name": "ZEPTO",
        "Chain Item Code": "318922",
        "Chain Item Name": "Eastern Meat Masala Powder Pouch - 1 pack (100 g)",
        "Tally Item Name": "Eastern Meat Masala 100g",
        "Tally Item SKU": "EAST-MM-100",
        "EAN Code": "8901440013280",
        "Brand Name": "Eastern",
        "Company Item Code": "EAST-MM-100G",
        "Company Item Name": "Eastern Meat Masala 100g Pouch",
        "PCS Per Case": 40,
        "Notes": "Sample mapping for Zepto"
      },
      {
        "Chain Name": "BLINKIT",
        "Chain Item Code": "10112731",
        "Chain Item Name": "Eastern Chicken Kebab Masala(Pouch) (100 GM)",
        "Tally Item Name": "Eastern Chicken Kebab Masala 100g",
        "Tally Item SKU": "EAST-CKM-100",
        "EAN Code": "8901440013501",
        "Brand Name": "Eastern",
        "Company Item Code": "EAST-CKM-100G",
        "Company Item Name": "Eastern Chicken Kebab Masala 100g",
        "PCS Per Case": 40,
        "Notes": "Sample mapping for Blinkit"
      },
      {
        "Chain Name": "DMART",
        "Chain Item Code": "8906012240019",
        "Chain Item Name": "DILBAHAR ANARDANA GOLI(100G)",
        "Tally Item Name": "Dilbahar Anardana Goli 100g",
        "Tally Item SKU": "DIL-AG-100",
        "EAN Code": "8906012240019",
        "Brand Name": "Dilbahar",
        "Company Item Code": "DIL-ANARDANA-100G",
        "Company Item Name": "Dilbahar Anardana Goli 100g Pouch",
        "PCS Per Case": 48,
        "Notes": "Sample mapping for DMart"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Mappings");
    XLSX.writeFile(wb, "Item_Mapping_Sample_Format.xlsx");
  }

  async function loadMappings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterChain) params.set('chain', filterChain);
    if (filterBrand) params.set('brand', filterBrand);
    if (search) params.set('search', search);
    const res = await fetch(`/api/item-mapping?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setMappings(data);
    } else if (data && data.mappings) {
      setMappings(Array.isArray(data.mappings) ? data.mappings : []);
      if (Array.isArray(data.brands) && data.brands.length > 0) {
        setAvailableBrands(data.brands);
      }
    }
    setLoading(false);
  }

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/item-mapping/upload', { method: 'POST', body: fd });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.status === 504 ? 'Server timed out (504 Gateway Timeout)' : `Server error (${res.status}): ${text.slice(0, 100)}`);
      }

      if (res.ok) {
        alert(`✅ Upload successful!\nCreated: ${data.created}\nUpdated: ${data.updated}`);
        loadMappings();
      } else {
        alert(`❌ Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`❌ Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
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
    setForm({ chainName: m.chainName, chainItemCode: m.chainItemCode, chainItemName: m.chainItemName, tallyItemName: m.tallyItemName, tallyItemSku: m.tallyItemSku || '', eanCode: m.eanCode || '', brandName: m.brandName || '', companyItemCode: m.companyItemCode || '', companyItemName: m.companyItemName || '', pcsPerCase: String(m.pcsPerCase), notes: m.notes || '' });
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
          <button onClick={downloadSampleExcel} className="btn secondary" style={{ whiteSpace: 'nowrap' }}>
            📥 Sample Format (.xlsx)
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn secondary" style={{ whiteSpace: 'nowrap' }}>
            {uploading ? 'Uploading...' : '📤 Bulk Upload'}
          </button>
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="btn" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', whiteSpace: 'nowrap' }}>
            + Add Mapping
          </button>
        </div>
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
        <input placeholder="🔍 Search item name, code or brand..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', fontSize: 13 }} />
        <select value={filterChain} onChange={e => setFilterChain(e.target.value)} style={{ padding: '8px 12px', minWidth: 140, fontSize: 13 }}>
          <option value="">All Chains</option>
          {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select 
          value={availableBrands.includes(filterBrand) ? filterBrand : ''} 
          onChange={e => setFilterBrand(e.target.value)} 
          style={{ padding: '8px 12px', minWidth: 160, fontSize: 13 }}
        >
          <option value="">All Brands</option>
          {availableBrands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <input 
          placeholder="Filter by brand..." 
          value={filterBrand} 
          onChange={e => setFilterBrand(e.target.value)}
          style={{ padding: '8px 12px', minWidth: 160, fontSize: 13 }} 
        />
        {filterBrand && (
          <button onClick={() => setFilterBrand('')} className="btn secondary" style={{ fontSize: 12, padding: '6px 10px' }}>✕ Clear Brand</button>
        )}
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
                  <th>EAN Code</th>
                  <th>Brand</th>
                  <th>Company Code</th>
                  <th>Company Name</th>
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
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.eanCode || '-'}</td>
                    <td>
                      {(() => {
                        let b = m.brandName;
                        if (!b) {
                          const text = `${m.chainItemName} ${m.tallyItemName}`.toLowerCase();
                          if (text.includes('mother')) b = "Mother's Recipe";
                          else if (text.includes('eastern')) b = "Eastern";
                          else if (text.includes('dilbahar')) b = "Dilbahar";
                        }
                        return b
                          ? <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{b}</span>
                          : <span className="muted">—</span>;
                      })()}
                    </td>
                    <td className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.companyItemCode || '-'}</td>
                    <td style={{ fontSize: 13, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.companyItemName || undefined}>
                      {m.companyItemName || '-'}
                    </td>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '32px 16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, marginBottom: 24 }}>
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
                  <label>EAN Code (optional)</label>
                  <input value={form.eanCode} onChange={e => setForm({ ...form, eanCode: e.target.value })} placeholder="e.g. 8901234567890" />
                </div>
                <div>
                  <label>Brand Name</label>
                  <input value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value })} placeholder="e.g. HUL, Nestle, ITC" />
                </div>
                <div>
                  <label>Company Item Code</label>
                  <input value={form.companyItemCode} onChange={e => setForm({ ...form, companyItemCode: e.target.value })} placeholder="Code for company order" />
                </div>
                <div>
                  <label>Company Item Name</label>
                  <input value={form.companyItemName} onChange={e => setForm({ ...form, companyItemName: e.target.value })} placeholder="Name for company order" />
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
