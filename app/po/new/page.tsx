"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'VISHAL', 'OTHER'];

type LineItem = {
  chainItemCode: string;
  chainItemName: string;
  eanCode?: string;
  quantityPcs: string;
  unitPrice: string;
  tallyItemName?: string;
  pcsPerCase?: number;
  matched?: boolean;
};

type Mapping = { chainItemCode: string; chainItemName: string; tallyItemName: string; eanCode?: string; pcsPerCase: number };

const norm = (s: string) => s ? s.trim().toLowerCase() : '';

export default function NewPOPage() {
  const router = useRouter();
  const [form, setForm] = useState({ poNumber: '', chainName: 'FLIPKART', poDate: '', appointmentDate: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([{ chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ fileName?: string; filePath?: string; rawDocumentInfo?: any } | null>(null);
  const [showAIFields, setShowAIFields] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load mappings for the selected chain for autocomplete & auto-matching
    fetch(`/api/item-mapping?chain=${form.chainName}`)
      .then(r => r.json())
      .then(d => {
        const loaded = Array.isArray(d) ? d : [];
        setMappings(loaded);

        // Re-evaluate items matching state against newly loaded chain mappings
        setItems(prevItems => prevItems.map(item => {
          const c = norm(item.chainItemCode);
          const n = norm(item.chainItemName);
          let m = null;
          if (c) {
            m = loaded.find((x: any) => norm(x.chainItemCode) === c || (x.eanCode && norm(x.eanCode) === c));
          }
          if (!m && n) {
            m = loaded.find((x: any) => norm(x.chainItemName) === n);
          }
          return {
            ...item,
            tallyItemName: m?.tallyItemName || item.tallyItemName,
            matched: !!m,
          };
        }));
      });
  }, [form.chainName]);

  const addItem = () => setItems([...items, { chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: val };

    const c = norm(field === 'chainItemCode' ? val : updated[i].chainItemCode);
    const n = norm(field === 'chainItemName' ? val : updated[i].chainItemName);

    let mapping = null;
    if (c) {
      mapping = mappings.find(m => norm(m.chainItemCode) === c || (m.eanCode && norm(m.eanCode) === c));
    }
    if (!mapping && n) {
      mapping = mappings.find(m => norm(m.chainItemName) === n);
    }

    if (mapping) {
      if (field === 'chainItemCode' && !updated[i].chainItemName) {
        updated[i].chainItemName = mapping.chainItemName;
      }
      updated[i].tallyItemName = mapping.tallyItemName;
      updated[i].matched = true;
    } else {
      updated[i].matched = false;
    }

    setItems(updated);
  };

  const isMapped = (item: LineItem) => {
    if (item.matched !== undefined) return item.matched;
    const c = norm(item.chainItemCode);
    const n = norm(item.chainItemName);
    if (!c && !n) return false;
    return mappings.some(m =>
      (c && norm(m.chainItemCode) === c) ||
      (c && m.eanCode && norm(m.eanCode) === c) ||
      (n && norm(m.chainItemName) === n)
    );
  };

  const total = items.reduce((s, i) => s + (parseFloat(i.quantityPcs || '0') * parseFloat(i.unitPrice || '0')), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.poNumber.trim()) { setError('PO Number is required'); return; }
    if (items.every(i => !i.chainItemCode)) { setError('Add at least one item'); return; }

    const unmapped = items.filter(i => i.chainItemCode && !isMapped(i));
    if (unmapped.length > 0) {
      const proceed = confirm(`${unmapped.length} item(s) have no matching Item Mapping and will be saved without a Tally name (they won't count toward stock/shortfall). Add mappings for these codes on the Item Mapping page first, or continue anyway?`);
      if (!proceed) return;
    }

    setSaving(true); setError('');
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          filePath: uploadedFile?.filePath,
          fileName: uploadedFile?.fileName,
          rawDocumentInfo: uploadedFile?.rawDocumentInfo,
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

  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('chainName', form.chainName);
    try {
      const res = await fetch('/api/po/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract PO');

      if (data.poNumber) setForm(f => ({ ...f, poNumber: data.poNumber }));
      if (data.poDate) setForm(f => ({ ...f, poDate: data.poDate }));
      if (data.appointmentDate) setForm(f => ({ ...f, appointmentDate: data.appointmentDate }));

      setUploadedFile({
        fileName: data.fileName,
        filePath: data.filePath,
        rawDocumentInfo: data.rawDocumentInfo,
      });

      if (data.items && data.items.length > 0) {
        setItems(data.items.map((i: any) => ({
          chainItemCode: i.chainItemCode || '',
          chainItemName: i.chainItemName || '',
          eanCode: i.eanCode || '',
          quantityPcs: String(i.quantityPcs || 0),
          unitPrice: String(i.unitPrice || 0),
          tallyItemName: i.tallyItemName || undefined,
          pcsPerCase: i.pcsPerCase || 1,
          matched: !!i.matched,
        })));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const rawInfo = uploadedFile?.rawDocumentInfo || {};

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>PO Details</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {uploadedFile?.filePath && (
                  <a href={uploadedFile.filePath} download={uploadedFile.fileName || 'PO_Document'} className="btn secondary" style={{ fontSize: 13, padding: '6px 12px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                    📄 View Uploaded File ({uploadedFile.fileName})
                  </a>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn secondary" style={{ fontSize: 13, background: 'var(--bg-secondary)' }}>
                  {uploading ? 'Extracting with AI...' : '📄 Upload PO (Auto-fill)'}
                </button>
              </div>
            </div>

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

          {/* AI Extracted 16 Fields Card */}
          {uploadedFile && (
            <div className="card" style={{ marginBottom: 20, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowAIFields(!showAIFields)}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 18 }}>🤖</span>
                  <div>
                    <strong style={{ fontSize: 14 }}>AI Extracted Document Summary (16 Fields)</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>File: {uploadedFile.fileName}</div>
                  </div>
                </div>
                <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 8px' }}>
                  {showAIFields ? 'Hide Details ▲' : 'Show 16 Fields ▼'}
                </button>
              </div>

              {showAIFields && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 12 }}>
                  <div><strong>1. Document Type:</strong> {rawInfo.documentType || 'Purchase Order'}</div>
                  <div><strong>2. Document Number:</strong> {rawInfo.documentNumber || form.poNumber || 'N/A'}</div>
                  <div><strong>3. Document Date:</strong> {rawInfo.documentDate || form.poDate || 'N/A'}</div>
                  <div><strong>4. Delivery / Due Date:</strong> {rawInfo.deliveryDate || form.appointmentDate || 'N/A'}</div>
                  <div><strong>5. Vendor Name:</strong> {rawInfo.vendorName || form.chainName}</div>
                  <div><strong>6. Vendor Address:</strong> {rawInfo.vendorAddress || 'N/A'}</div>
                  <div><strong>7. Vendor Contact:</strong> {rawInfo.vendorContact || 'N/A'}</div>
                  <div><strong>8. Vendor GSTIN:</strong> {rawInfo.vendorGST || 'N/A'}</div>
                  <div><strong>9. Buyer Name:</strong> {rawInfo.buyerName || 'Bhavish CRM'}</div>
                  <div><strong>10. Buyer Address:</strong> {rawInfo.buyerAddress || 'N/A'}</div>
                  <div><strong>11. Buyer GSTIN:</strong> {rawInfo.buyerGST || 'N/A'}</div>
                  <div><strong>12. Shipping Address:</strong> {rawInfo.shippingAddress || 'N/A'}</div>
                  <div><strong>13. Payment Terms:</strong> {rawInfo.paymentTerms || 'N/A'}</div>
                  <div><strong>14. Subtotal:</strong> ₹{rawInfo.subtotal ? Number(rawInfo.subtotal).toLocaleString('en-IN') : '0'}</div>
                  <div><strong>15. Tax Amount:</strong> ₹{rawInfo.taxAmount ? Number(rawInfo.taxAmount).toLocaleString('en-IN') : '0'}</div>
                  <div><strong>16. Total Amount:</strong> ₹{rawInfo.totalAmount ? Number(rawInfo.totalAmount).toLocaleString('en-IN') : total.toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
          )}

          {/* Line Items */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Line Items</h3>
              <button type="button" onClick={addItem} className="btn secondary" style={{ fontSize: 13, padding: '6px 14px' }}>+ Add Row</button>
            </div>

            {mappings.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 16 }}>
                💡 {mappings.length} mappings found for {form.chainName} — type a chain code or EAN to auto-fill Tally SKU
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['#', 'Chain Item Code', 'EAN / Barcode', 'Item Name', 'Mapping & Tally SKU', 'Qty (PCS)', 'Cases', 'Unit Price (₹)', 'Total (₹)', ''].map(h => (
                      <th key={h} style={{ padding: '10px 8px', textAlign: h.includes('Qty') || h.includes('Cases') || h.includes('Price') || h.includes('Total') ? 'right' : 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const cases = (parseFloat(item.quantityPcs || '0') / (item.pcsPerCase || 1)).toFixed(1);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <input list={`codes-${i}`} value={item.chainItemCode} onChange={e => updateItem(i, 'chainItemCode', e.target.value)}
                            placeholder="Item code" style={{ width: '100%', padding: '6px 8px', fontSize: 13, fontFamily: 'monospace' }} />
                          <datalist id={`codes-${i}`}>
                            {mappings.map(m => <option key={m.chainItemCode} value={m.chainItemCode}>{m.chainItemName}</option>)}
                          </datalist>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input value={item.eanCode || ''} onChange={e => updateItem(i, 'eanCode', e.target.value)}
                            placeholder="EAN / Barcode" style={{ width: 130, padding: '6px 8px', fontSize: 12, fontFamily: 'monospace' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input value={item.chainItemName} onChange={e => updateItem(i, 'chainItemName', e.target.value)}
                            placeholder="Item name" style={{ width: '100%', minWidth: 160, padding: '6px 8px', fontSize: 13 }} />
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          {!item.chainItemCode && !item.eanCode && !item.chainItemName ? null : isMapped(item) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span title={item.tallyItemName} style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, display: 'inline-block' }}>
                                ✓ {item.tallyItemName || 'Mapped'}
                              </span>
                              {item.pcsPerCase && item.pcsPerCase > 1 ? (
                                <span style={{ fontSize: 10, color: '#64748b' }}>1 Case = {item.pcsPerCase} Pcs</span>
                              ) : null}
                            </div>
                          ) : (
                            <span title="No matching Item Mapping found" style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                              ⚠ Unmapped
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                          <input type="number" min="0" value={item.quantityPcs} onChange={e => updateItem(i, 'quantityPcs', e.target.value)}
                            placeholder="0" style={{ width: 80, padding: '6px 8px', fontSize: 13, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                          {cases} cs
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                            placeholder="0.00" style={{ width: 90, padding: '6px 8px', fontSize: 13, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                          ₹{(parseFloat(item.quantityPcs || '0') * parseFloat(item.unitPrice || '0')).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 16 }}>✕</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={8} style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>Total PO Value:</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontSize: 16 }}>₹{total.toLocaleString('en-IN')}</td>
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
