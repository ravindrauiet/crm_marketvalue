"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const CHAINS = ['FLIPKART', 'AMAZON', 'ZEPTO', 'BLINKIT', 'SWIGGY', 'BIGBASKET', 'DMART', 'VISHAL', 'OTHER'];

const CHAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  FLIPKART: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  AMAZON: { bg: '#fff7ed', text: '#c2410c', border: '#ffedd5' },
  ZEPTO: { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  BLINKIT: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  SWIGGY: { bg: '#fff7ed', text: '#ea580c', border: '#ffedd5' },
  BIGBASKET: { bg: '#f7fee7', text: '#4d7c0f', border: '#d9f99d' },
  DMART: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  VISHAL: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  OTHER: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
};

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

type UploadedFile = {
  fileName: string;
  filePath: string;
  objectUrl?: string;
  fileType: 'pdf' | 'image' | 'excel' | 'doc';
  rawDocumentInfo?: any;
};

function formatDateForInput(dateVal: any): string {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (!str) return '';

  const singleStr = str.split('-')[0].trim().split(/to/i)[0].trim();

  // 1. DD.MM.YYYY
  const dotParts = singleStr.split('.');
  if (dotParts.length === 3) {
    const day = parseInt(dotParts[0], 10);
    const month = parseInt(dotParts[1], 10);
    let year = parseInt(dotParts[2], 10);
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // 2. DD/MM/YYYY
  const slashParts = singleStr.split('/');
  if (slashParts.length === 3) {
    const p0 = parseInt(slashParts[0], 10);
    const p1 = parseInt(slashParts[1], 10);
    let p2 = parseInt(slashParts[2], 10);
    if (p2 < 100) p2 += 2000;

    let day = p0;
    let month = p1;
    let year = p2;

    if (p0 > 12) {
      day = p0; month = p1;
    } else if (p1 > 12) {
      day = p1; month = p0;
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return '';
}

const norm = (s: string) => s ? s.trim().toLowerCase() : '';

export default function NewPOPage() {
  const router = useRouter();
  const [form, setForm] = useState({ poNumber: '', chainName: 'FLIPKART', poDate: '', appointmentDate: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([{ chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  
  // View states
  const [showAIFields, setShowAIFields] = useState(true);
  const [viewLayout, setViewLayout] = useState<'split' | 'stacked'>('split');
  const [isFullScreenPreview, setIsFullScreenPreview] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/item-mapping?chain=${form.chainName}`)
      .then(r => r.json())
      .then(d => {
        const loaded = Array.isArray(d) ? d : [];
        setMappings(loaded);

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
            pcsPerCase: m?.pcsPerCase || item.pcsPerCase || 1
          };
        }));
      });
  }, [form.chainName]);

  const addItem = () => setItems([...items, { chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const clearItems = () => setItems([{ chainItemCode: '', chainItemName: '', quantityPcs: '', unitPrice: '' }]);

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
      updated[i].pcsPerCase = mapping.pcsPerCase;
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

  const totalValue = items.reduce((s, i) => s + (parseFloat(i.quantityPcs || '0') * parseFloat(i.unitPrice || '0')), 0);
  const totalPcs = items.reduce((s, i) => s + (parseInt(i.quantityPcs || '0') || 0), 0);
  const totalCases = items.reduce((s, i) => s + ((parseFloat(i.quantityPcs || '0') || 0) / (i.pcsPerCase || 1)), 0);
  const mappedCount = items.filter(i => (i.chainItemCode || i.chainItemName) && isMapped(i)).length;
  const unmappedCount = items.filter(i => (i.chainItemCode || i.chainItemName) && !isMapped(i)).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.poNumber.trim()) { setError('PO Number is required'); return; }
    if (items.every(i => !i.chainItemCode && !i.chainItemName)) { setError('Add at least one line item'); return; }

    const unmapped = items.filter(i => (i.chainItemCode || i.chainItemName) && !isMapped(i));
    if (unmapped.length > 0) {
      const proceed = confirm(`${unmapped.length} item(s) have no matching Item Mapping and will be saved without a Tally name. Continue anyway?`);
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
          items: items.filter(i => i.chainItemCode || i.chainItemName).map(i => ({
            ...i,
            quantityPcs: parseInt(i.quantityPcs) || 0,
            unitPrice: parseFloat(i.unitPrice) || 0
          }))
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

    const mime = file.type || '';
    const name = file.name.toLowerCase();

    const isPdf = name.endsWith('.pdf') || mime.includes('pdf');
    const isCsv = name.endsWith('.csv') || mime.includes('csv');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('sheet');

    if (!isPdf && !isCsv && !isExcel) {
      setError('Only .pdf, .csv, and .xlsx/.xls files are supported. Please upload a PDF, CSV, or Excel document.');
      return;
    }

    setUploading(true); setError('');

    const objectUrl = URL.createObjectURL(file);
    let fType: 'pdf' | 'image' | 'excel' | 'doc' = 'doc';
    if (isPdf) fType = 'pdf';
    else if (isCsv || isExcel) fType = 'excel';

    // Show preview immediately while AI parses in background
    setUploadedFile({
      fileName: file.name,
      filePath: objectUrl,
      objectUrl: objectUrl,
      fileType: fType,
      rawDocumentInfo: null
    });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('chainName', form.chainName);
    try {
      const res = await fetch('/api/po/upload', { method: 'POST', body: fd });
      const contentType = res.headers.get('content-type') || '';
      let data: any = {};

      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 504) {
          throw new Error('Server processing timed out (504 Gateway Timeout). The file extraction took too long on the server. Please try again or convert to CSV format.');
        }
        throw new Error(`Server returned error (${res.status}): ${text.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(data.error || 'Failed to extract PO');

      if (data.poNumber) setForm(f => ({ ...f, poNumber: data.poNumber }));
      if (data.poDate) setForm(f => ({ ...f, poDate: formatDateForInput(data.poDate) }));
      if (data.appointmentDate) setForm(f => ({ ...f, appointmentDate: formatDateForInput(data.appointmentDate) }));
      if (data.detectedChain) setForm(f => ({ ...f, chainName: data.detectedChain }));

      setUploadedFile({
        fileName: data.fileName || file.name,
        filePath: data.filePath || objectUrl,
        objectUrl: objectUrl,
        fileType: fType,
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const rawInfo = uploadedFile?.rawDocumentInfo || {};
  const currentChainStyle = CHAIN_COLORS[form.chainName] || CHAIN_COLORS.OTHER;

  const filteredItems = items.filter(item => {
    if (!tableSearch.trim()) return true;
    const s = tableSearch.toLowerCase();
    return (
      item.chainItemCode.toLowerCase().includes(s) ||
      item.chainItemName.toLowerCase().includes(s) ||
      (item.tallyItemName && item.tallyItemName.toLowerCase().includes(s)) ||
      (item.eanCode && item.eanCode.toLowerCase().includes(s))
    );
  });

  return (
    <div className="container fade-in" style={{ maxWidth: uploadedFile && viewLayout === 'split' ? 1680 : 1100, transition: 'all 0.3s ease' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/po" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
            ← Back to Purchase Orders
          </Link>
          <h1 style={{ marginTop: 6, marginBottom: 4, fontSize: 28, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
            📦 Create Final Purchase Order (Manual)
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Manually enter PO header details and line items based on shortfall analysis to issue final order to company
          </p>
        </div>

        {/* Header Quick Stats & View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {uploadedFile && (
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setViewLayout('split')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewLayout === 'split' ? 'var(--panel)' : 'transparent',
                  color: viewLayout === 'split' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: viewLayout === 'split' ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                ↔ Split Preview
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('stacked')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewLayout === 'stacked' ? 'var(--panel)' : 'transparent',
                  color: viewLayout === 'stacked' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: viewLayout === 'stacked' ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                ↕ Stacked View
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', fontSize: 13, padding: '9px 16px' }}
          >
            {uploading ? (
              <>
                <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Extracting AI...
              </>
            ) : (
              <>📎 {uploadedFile ? 'Re-upload Reference Doc' : 'Auto-fill from Doc (Optional)'}</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: '#fee2e2', color: '#dc2626', borderRadius: 12, marginBottom: 20, fontSize: 14, border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span> <span>{error}</span>
        </div>
      )}

      {/* Main Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: uploadedFile && viewLayout === 'split' ? 'minmax(380px, 0.75fr) minmax(640px, 1.5fr)' : '1fr',
        gap: 24,
        alignItems: 'start'
      }}>

        {/* LEFT COLUMN: UPLOADED PO DOCUMENT VIEWER (VISIBLE WHENEVER PO IS UPLOADED) */}
        {uploadedFile && (
          <div style={{ position: viewLayout === 'split' ? 'sticky' : 'static', top: 20, zIndex: 10 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--primary)', boxShadow: 'var(--shadow-md)', background: 'var(--panel)' }}>
              
              {/* Document Header Bar */}
              <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                  <span style={{ fontSize: 20 }}>
                    {uploadedFile.fileType === 'pdf' ? '📄' : uploadedFile.fileType === 'image' ? '🖼️' : '📊'}
                  </span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {uploadedFile.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>PO Document Preview</span>
                      <span>•</span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                        {uploading ? 'Extracting...' : 'Extracted ✓'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Toolbar buttons */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {uploadedFile.fileType === 'image' && (
                    <>
                      <button type="button" title="Zoom Out" onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))} style={{ background: '#334155', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>-</button>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>{Math.round(imageZoom * 100)}%</span>
                      <button type="button" title="Zoom In" onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} style={{ background: '#334155', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>+</button>
                      <button type="button" title="Rotate" onClick={() => setImageRotation(r => (r + 90) % 360)} style={{ background: '#334155', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>🔄</button>
                    </>
                  )}
                  <button
                    type="button"
                    title="Fullscreen Lightbox"
                    onClick={() => setIsFullScreenPreview(true)}
                    style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ⛶ Fullscreen
                  </button>
                  <a
                    href={uploadedFile.filePath}
                    download={uploadedFile.fileName}
                    style={{ background: '#334155', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}
                    title="Download File"
                  >
                    ⬇
                  </a>
                  <button
                    type="button"
                    title="Remove Document"
                    onClick={() => setUploadedFile(null)}
                    style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#ef4444', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Document Body View */}
              <div style={{ background: '#0f172a', position: 'relative', minHeight: 450, maxHeight: 620, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {uploadedFile.fileType === 'pdf' ? (
                  <iframe
                    src={uploadedFile.filePath}
                    style={{ width: '100%', height: '600px', border: 'none' }}
                    title="Uploaded PO PDF preview"
                  />
                ) : uploadedFile.fileType === 'image' ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: 450 }}>
                    <img
                      src={uploadedFile.filePath}
                      alt={uploadedFile.fileName}
                      style={{
                        transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                        transition: 'transform 0.2s ease',
                        maxWidth: '100%',
                        maxHeight: '560px',
                        objectFit: 'contain',
                        borderRadius: 8,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: 32, textAlign: 'center', color: '#f8fafc', width: '100%' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 18, color: '#f8fafc' }}>{uploadedFile.fileName}</h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 360, margin: '0 auto 16px auto' }}>
                      Spreadsheet / Document uploaded successfully. All line items and metadata have been automatically extracted by AI below.
                    </p>
                    <a
                      href={uploadedFile.filePath}
                      download={uploadedFile.fileName}
                      className="btn secondary"
                      style={{ fontSize: 12, background: '#1e293b', color: '#38bdf8', border: '1px solid #334155' }}
                    >
                      📥 Download Original Spreadsheet
                    </a>
                  </div>
                )}

                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 12, zIndex: 5 }}>
                    <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#38bdf8' }} />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Extracting PO Data via AI...</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Auto-matching SKU mappings for {form.chainName}</div>
                  </div>
                )}
              </div>

              {/* Document Extracted Footer Summary */}
              {uploadedFile.rawDocumentInfo && (
                <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🤖 AI Extracted Details ({Object.keys(rawInfo).length} Fields)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAIFields(!showAIFields)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                    >
                      {showAIFields ? 'Hide Details ▲' : 'Show Details ▼'}
                    </button>
                  </div>

                  {showAIFields && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Doc Number:</span> <strong>{rawInfo.documentNumber || form.poNumber || 'N/A'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Doc Date:</span> <strong>{rawInfo.documentDate || form.poDate || 'N/A'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Delivery Date:</span> <strong>{rawInfo.deliveryDate || form.appointmentDate || 'N/A'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Vendor:</span> <strong>{rawInfo.vendorName || form.chainName}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span> <strong>₹{rawInfo.subtotal ? Number(rawInfo.subtotal).toLocaleString('en-IN') : '0'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Total Amount:</span> <strong>₹{rawInfo.totalAmount ? Number(rawInfo.totalAmount).toLocaleString('en-IN') : totalValue.toLocaleString('en-IN')}</strong></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: PO DETAILS FORM & LINE ITEMS */}
        <div>
          <form onSubmit={handleSubmit}>



            {/* PO Details Card */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>PO Header Details</h3>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: currentChainStyle.bg,
                    color: currentChainStyle.text,
                    border: `1px solid ${currentChainStyle.border}`
                  }}>
                    {form.chainName}
                  </span>
                </div>
                {uploadedFile && (
                  <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ✓ Document Attached ({uploadedFile.fileName})
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ fontWeight: 600 }}>PO Number *</label>
                  <input
                    required
                    value={form.poNumber}
                    onChange={e => setForm({ ...form, poNumber: e.target.value })}
                    placeholder="e.g. FK-PO-2024-001"
                    style={{ fontWeight: 600, fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Retail Chain *</label>
                  <select
                    value={form.chainName}
                    onChange={e => setForm({ ...form, chainName: e.target.value })}
                    style={{ fontWeight: 600 }}
                  >
                    {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>PO Date</label>
                  <input
                    type="date"
                    value={form.poDate}
                    onChange={e => setForm({ ...form, poDate: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Appointment / Delivery Date</label>
                  <input
                    type="date"
                    value={form.appointmentDate}
                    onChange={e => setForm({ ...form, appointmentDate: e.target.value })}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontWeight: 600 }}>Notes / Instructions</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Add any delivery window notes or special instructions..."
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Line Items Card */}
            <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
              
              {/* Line Items Table Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🛒 Line Items
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {items.length} items
                    </span>
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 12 }}>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {mappedCount} Mapped to Tally</span>
                    {unmappedCount > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ {unmappedCount} Unmapped</span>}
                  </div>
                </div>

                {/* Table actions & filter search */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {items.length > 5 && (
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      style={{ padding: '5px 10px', fontSize: 12, width: 150, borderRadius: 6 }}
                    />
                  )}
                  <button type="button" onClick={clearItems} className="btn secondary" style={{ fontSize: 12, padding: '5px 10px' }}>
                    Clear
                  </button>
                  <button type="button" onClick={addItem} className="btn" style={{ fontSize: 12, padding: '6px 14px', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                    + Add Row
                  </button>
                </div>
              </div>

              {/* Chain Mapping Info Banner */}
              {mappings.length > 0 ? (
                <div style={{ padding: '8px 20px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', fontSize: 12, color: '#1d4ed8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>💡 <strong>{mappings.length} Tally SKU mappings</strong> active for {form.chainName} — items auto-match on code or barcode</span>
                  <Link href="/item-mapping" target="_blank" style={{ fontSize: 11, textDecoration: 'underline', color: '#1e40af', fontWeight: 600 }}>
                    Manage Mappings ↗
                  </Link>
                </div>
              ) : (
                <div style={{ padding: '8px 20px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', fontSize: 12, color: '#b45309' }}>
                  ⚠️ No SKU mappings found for {form.chainName}. Add mappings under Item Mapping to automatically resolve Tally item names.
                </div>
              )}

              {/* Line Items Table */}
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: 1250, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', width: 36, textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>#</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', minWidth: 240, whiteSpace: 'nowrap' }}>Chain Item Code</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', minWidth: 160, whiteSpace: 'nowrap' }}>EAN / Barcode</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', minWidth: 260, whiteSpace: 'nowrap' }}>Item Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', minWidth: 180, whiteSpace: 'nowrap' }}>Tally SKU Mapping</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', minWidth: 95, whiteSpace: 'nowrap' }}>Qty (PCS)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', minWidth: 75, whiteSpace: 'nowrap' }}>Cases</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', minWidth: 105, whiteSpace: 'nowrap' }}>Unit Price (₹)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', minWidth: 115, whiteSpace: 'nowrap' }}>Total (₹)</th>
                      <th style={{ padding: '10px 12px', width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, index) => {
                      const realIndex = items.indexOf(item);
                      const pcs = parseFloat(item.quantityPcs || '0') || 0;
                      const price = parseFloat(item.unitPrice || '0') || 0;
                      const lineTotal = pcs * price;
                      const pcsPerCase = item.pcsPerCase || 1;
                      const cases = (pcs / pcsPerCase).toFixed(1);
                      const mapped = isMapped(item);

                      return (
                        <tr key={realIndex} style={{ borderBottom: '1px solid var(--border)', background: mapped ? 'transparent' : 'rgba(239, 68, 68, 0.02)' }}>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
                            {realIndex + 1}
                          </td>
                          <td style={{ padding: '6px 8px', minWidth: 240 }}>
                            <input
                              list={`codes-${realIndex}`}
                              value={item.chainItemCode}
                              title={item.chainItemCode}
                              onChange={e => updateItem(realIndex, 'chainItemCode', e.target.value)}
                              placeholder="Chain Item Code"
                              style={{ width: '100%', minWidth: 220, padding: '8px 10px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}
                            />
                            <datalist id={`codes-${realIndex}`}>
                              {mappings.map(m => <option key={m.chainItemCode} value={m.chainItemCode}>{m.chainItemName}</option>)}
                            </datalist>
                          </td>
                          <td style={{ padding: '6px 8px', minWidth: 160 }}>
                            <input
                              value={item.eanCode || ''}
                              title={item.eanCode || ''}
                              onChange={e => updateItem(realIndex, 'eanCode', e.target.value)}
                              placeholder="Barcode"
                              style={{ width: '100%', minWidth: 140, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              value={item.chainItemName}
                              onChange={e => updateItem(realIndex, 'chainItemName', e.target.value)}
                              placeholder="Chain Product Description"
                              style={{ width: '100%', minWidth: 200, padding: '7px 10px', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {!item.chainItemCode && !item.eanCode && !item.chainItemName ? null : mapped ? (
                              <div>
                                <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'inline-block', border: '1px solid #bbf7d0' }}>
                                  ✓ {item.tallyItemName || 'Mapped'}
                                </span>
                                {pcsPerCase > 1 && (
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    1 Case = {pcsPerCase} Pcs
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, border: '1px solid #fca5a5' }}>
                                ⚠️ Unmapped SKU
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.quantityPcs}
                              onChange={e => updateItem(realIndex, 'quantityPcs', e.target.value)}
                              placeholder="0"
                              style={{ width: '100%', minWidth: 80, padding: '7px 10px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {cases} cs
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => updateItem(realIndex, 'unitPrice', e.target.value)}
                              placeholder="0.00"
                              style={{ width: '100%', minWidth: 90, padding: '7px 10px', fontSize: 13, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                            ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(realIndex)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 15, padding: 4 }}
                                title="Remove Line Item"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Totals */}
              <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span>Total Line Items: <strong style={{ color: 'var(--text)' }}>{items.length}</strong></span>
                  <span>Total Quantity: <strong style={{ color: 'var(--text)' }}>{totalPcs.toLocaleString('en-IN')} Pcs</strong></span>
                  <span>Total Volume: <strong style={{ color: 'var(--text)' }}>{totalCases.toFixed(1)} Cases</strong></span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                  Total PO Amount: <span style={{ color: '#16a34a', fontSize: 22 }}>₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions Floating Bar */}
            <div style={{
              position: 'sticky',
              bottom: 20,
              zIndex: 20,
              padding: '16px 24px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backdropFilter: 'blur(8px)'
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Summary</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {form.poNumber || 'New PO'} • <span style={{ color: '#16a34a' }}>₹{totalValue.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Link href="/po" className="btn secondary">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    padding: '10px 24px',
                    fontSize: 15,
                    fontWeight: 600,
                    minWidth: 160
                  }}
                >
                  {saving ? (
                    <>
                      <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Saving PO...
                    </>
                  ) : (
                    <>📦 Save Purchase Order</>
                  )}
                </button>
              </div>
            </div>

          </form>
        </div>
      </div>

      {/* FULLSCREEN PREVIEW LIGHTBOX MODAL */}
      {isFullScreenPreview && uploadedFile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 20
        }}>
          {/* Modal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>📄</span>
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 18 }}>{uploadedFile.fileName}</h3>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Fullscreen Document Lightbox</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFullScreenPreview(false)}
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
            >
              ✕ Close Preview
            </button>
          </div>

          {/* Modal Content */}
          <div style={{ flex: 1, overflow: 'hidden', borderRadius: 12, background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {uploadedFile.fileType === 'pdf' ? (
              <iframe src={uploadedFile.filePath} style={{ width: '100%', height: '100%', border: 'none' }} title="Fullscreen PDF Preview" />
            ) : uploadedFile.fileType === 'image' ? (
              <img src={uploadedFile.filePath} alt={uploadedFile.fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#fff', textAlign: 'center' }}>
                <h2>{uploadedFile.fileName}</h2>
                <a href={uploadedFile.filePath} download={uploadedFile.fileName} className="btn" style={{ background: '#3b82f6', marginTop: 16 }}>Download Document</a>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
