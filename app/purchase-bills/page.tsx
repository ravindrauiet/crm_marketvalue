"use client";
import { useState, useEffect, useRef } from 'react';

type BillItem = {
  id?: string;
  itemName: string; tallyItemName?: string; quantity: number;
  unit?: string; rate: number; amount: number; taxRate?: number; taxAmount?: number; hsnCode?: string;
};
type Bill = {
  id: string; fileName?: string; status: string; supplierName?: string;
  invoiceNumber?: string; invoiceDate?: string; totalAmount: number;
  taxAmount: number; filePath?: string; mimeType?: string;
  duplicateOf?: string; errorMessage?: string;
  items: BillItem[];
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: '⏳ Pending', color: '#92400e', bg: '#fef3c7' },
  PROCESSING: { label: '🔄 Extracting…', color: '#1d4ed8', bg: '#dbeafe' },
  EXTRACTED: { label: '📋 Review Needed', color: '#7c3aed', bg: '#ede9fe' },
  VERIFIED: { label: '✅ Verified', color: '#065f46', bg: '#d1fae5' },
  POSTED: { label: '✅ Posted to Tally', color: '#065f46', bg: '#d1fae5' },
  DUPLICATE: { label: '⚠️ Duplicate', color: '#92400e', bg: '#fef3c7' },
  FAILED: { label: '❌ Failed', color: '#dc2626', bg: '#fee2e2' },
};

export default function PurchaseBillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reviews, setReviews] = useState<Record<string, Bill>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadBills(); }, []);

  // Poll for processing bills
  useEffect(() => {
    const processing = bills.filter(b => b.status === 'PENDING' || b.status === 'PROCESSING');
    if (processing.length === 0) return;
    const t = setTimeout(loadBills, 3000);
    return () => clearTimeout(t);
  }, [bills]);

  async function loadBills() {
    const res = await fetch('/api/purchase-bills');
    const data = await res.json();
    setBills(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function uploadFile(file: File) {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Only PDF, JPG, PNG, WEBP files are supported'); return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/purchase-bills', { method: 'POST', body: fd });
    if (res.ok) {
      await loadBills();
      // Trigger extraction
      const bill = await res.json();
      fetch(`/api/purchase-bills/${bill.id}/extract`, { method: 'POST' })
        .then(() => { setTimeout(loadBills, 2000); setTimeout(loadBills, 5000); });
    } else {
      alert('Upload failed');
    }
    setUploading(false);
  }

  function openReview(bill: Bill) {
    setReviews(prev => ({ ...prev, [bill.id]: { ...bill, items: bill.items?.length ? JSON.parse(JSON.stringify(bill.items)) : [] } }));
  }

  function updateReviewField(billId: string, field: string, value: any) {
    setReviews(prev => ({ ...prev, [billId]: { ...prev[billId], [field]: value } }));
  }

  function updateReviewItem(billId: string, idx: number, field: string, value: any) {
    setReviews(prev => {
      const bill = { ...prev[billId] };
      const items = [...bill.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'quantity' || field === 'rate') {
        items[idx].amount = (parseFloat(items[idx].quantity as any) || 0) * (parseFloat(items[idx].rate as any) || 0);
      }
      return { ...prev, [billId]: { ...bill, items } };
    });
  }

  async function approveBill(billId: string) {
    const reviewData = reviews[billId];
    if (!reviewData) return;
    setSubmitting(billId);
    const res = await fetch(`/api/purchase-bills/${billId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierName: reviewData.supplierName,
        invoiceNumber: reviewData.invoiceNumber,
        invoiceDate: reviewData.invoiceDate,
        items: reviewData.items,
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert('✅ Bill approved and posted to Tally!');
      setReviews(prev => { const p = { ...prev }; delete p[billId]; return p; });
      loadBills();
    } else {
      alert('Error: ' + data.error);
    }
    setSubmitting(null);
  }

  async function downloadXml(bill: Bill) {
    setDownloading(bill.id);
    // If already posted, re-approve to get XML
    const res = await fetch(`/api/purchase-bills/${bill.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName: bill.supplierName, invoiceNumber: bill.invoiceNumber, invoiceDate: bill.invoiceDate, items: bill.items })
    });
    const data = await res.json();
    if (data.tallyXml) {
      const blob = new Blob([data.tallyXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `tally-purchase-${bill.invoiceNumber || bill.id}.xml`;
      a.click(); URL.revokeObjectURL(url);
    }
    setDownloading(null);
  }

  async function retryExtract(bill: Bill) {
    await fetch(`/api/purchase-bills/${bill.id}/extract`, { method: 'POST' });
    setTimeout(loadBills, 2000);
    setTimeout(loadBills, 5000);
    loadBills();
  }

  const stats = {
    total: bills.length,
    review: bills.filter(b => b.status === 'EXTRACTED').length,
    posted: bills.filter(b => b.status === 'POSTED').length,
    duplicates: bills.filter(b => b.status === 'DUPLICATE').length,
  };

  return (
    <div className="container fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, background: 'linear-gradient(135deg, #f59e0b, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          🧾 Purchase Bills – OCR Import
        </h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Upload PDF or image bills → AI extracts data → verify → post to Tally</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Bills', value: stats.total, bg: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
          { label: 'Need Review', value: stats.review, bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
          { label: 'Posted to Tally', value: stats.posted, bg: 'linear-gradient(135deg,#10b981,#059669)' },
          { label: 'Duplicates', value: stats.duplicates, bg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 18, background: s.bg, border: 'none', color: '#fff' }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Upload Zone */}
      <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
        onClick={() => fileRef.current?.click()}
        className="card" style={{ marginBottom: 24, padding: 40, textAlign: 'center', cursor: 'pointer', border: `2px dashed ${dragOver ? '#f59e0b' : 'var(--border)'}`, background: dragOver ? '#fffbeb' : 'var(--bg-secondary)', transition: 'all 0.2s' }}>
        <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
        {uploading ? (
          <div><div className="spinner" style={{ margin: '0 auto 12px' }} /><p>Uploading & starting OCR extraction…</p></div>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
            <h3 style={{ marginBottom: 8 }}>Drop purchase bill here</h3>
            <p className="muted" style={{ margin: 0 }}>PDF, JPG, PNG, WEBP · AI will auto-extract supplier, invoice no, items & amounts</p>
          </>
        )}
      </div>

      {/* Bills List */}
      {loading ? (
        <div style={{ padding: 64, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : bills.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <p className="muted">No bills uploaded yet. Drop a PDF or image above to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {bills.map(bill => {
            const st = STATUS_STYLE[bill.status] || STATUS_STYLE.PENDING;
            const isInReview = !!reviews[bill.id];
            const reviewData = reviews[bill.id];

            return (
              <div key={bill.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Bill Header */}
                <div style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{bill.supplierName || bill.fileName || 'Unnamed Bill'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {bill.invoiceNumber ? `Invoice: ${bill.invoiceNumber}` : 'Invoice # not yet extracted'}
                      {bill.invoiceDate ? ` · ${new Date(bill.invoiceDate).toLocaleDateString('en-IN')}` : ''}
                    </div>
                    {bill.duplicateOf && <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>⚠️ Duplicate of {bill.duplicateOf}</div>}
                    {bill.errorMessage && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>❌ {bill.errorMessage}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>₹{bill.totalAmount.toLocaleString('en-IN')}</div>
                    <div className="muted" style={{ fontSize: 11 }}>Tax: ₹{bill.taxAmount.toLocaleString('en-IN')}</div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.label}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(bill.status === 'EXTRACTED' || bill.status === 'DUPLICATE') && (
                      <button onClick={() => isInReview ? setReviews(p => { const n = {...p}; delete n[bill.id]; return n; }) : openReview(bill)} className="btn" style={{ fontSize: 12, padding: '5px 12px', background: isInReview ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: isInReview ? 'var(--text)' : '#fff' }}>
                        {isInReview ? 'Close Review' : '📋 Review'}
                      </button>
                    )}
                    {bill.status === 'POSTED' && (
                      <button onClick={() => downloadXml(bill)} disabled={downloading === bill.id} className="btn secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
                        {downloading === bill.id ? '…' : '⬇️ XML'}
                      </button>
                    )}
                    {bill.status === 'FAILED' && (
                      <button onClick={() => retryExtract(bill)} className="btn secondary" style={{ fontSize: 12, padding: '5px 12px' }}>🔄 Retry</button>
                    )}
                    {(bill.status === 'PENDING' || bill.status === 'PROCESSING') && (
                      <button onClick={() => retryExtract(bill)} className="btn secondary" style={{ fontSize: 12, padding: '5px 12px' }}>🔄 Extract</button>
                    )}
                  </div>
                </div>

                {/* Review Panel */}
                {isInReview && reviewData && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 20, background: 'var(--bg-secondary)' }}>
                    <h4 style={{ marginTop: 0, marginBottom: 16, color: '#7c3aed' }}>📋 Verify Extracted Data</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                      {[
                        { label: 'Supplier Name', field: 'supplierName' },
                        { label: 'Invoice Number', field: 'invoiceNumber' },
                        { label: 'Invoice Date', field: 'invoiceDate', type: 'date' },
                      ].map(f => (
                        <div key={f.field}>
                          <label style={{ fontSize: 12, marginBottom: 4 }}>{f.label}</label>
                          <input type={f.type || 'text'} value={(reviewData as any)[f.field] || ''}
                            onChange={e => updateReviewField(bill.id, f.field, e.target.value)}
                            style={{ padding: '8px 10px', fontSize: 13 }} />
                        </div>
                      ))}
                    </div>

                    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                            {['Item Name (Bill)', 'Tally Name', 'Qty', 'Unit', 'Rate', 'Amount', 'GST%', 'GST Amt'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reviewData.items.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                              {[
                                { field: 'itemName', placeholder: 'Item from bill' },
                                { field: 'tallyItemName', placeholder: 'Tally name' },
                                { field: 'quantity', placeholder: '0', type: 'number' },
                                { field: 'unit', placeholder: 'PCS' },
                                { field: 'rate', placeholder: '0.00', type: 'number' },
                                { field: 'amount', placeholder: '0.00', type: 'number' },
                                { field: 'taxRate', placeholder: '0.18', type: 'number' },
                                { field: 'taxAmount', placeholder: '0.00', type: 'number' },
                              ].map(col => (
                                <td key={col.field} style={{ padding: '4px 6px' }}>
                                  <input type={col.type || 'text'} value={(item as any)[col.field] || ''}
                                    onChange={e => updateReviewItem(bill.id, idx, col.field, col.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                                    placeholder={col.placeholder} style={{ width: '100%', padding: '5px 8px', fontSize: 12 }} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button onClick={() => setReviews(p => { const n = {...p}; delete n[bill.id]; return n; })} className="btn secondary" style={{ fontSize: 13 }}>Cancel</button>
                      <button onClick={() => approveBill(bill.id)} disabled={submitting === bill.id} className="btn"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: 13, minWidth: 200 }}>
                        {submitting === bill.id ? 'Posting…' : '✅ Approve & Post to Tally'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
