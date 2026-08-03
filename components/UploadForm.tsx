"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadForm({
  preselectedVendor,
  onSuccess
}: {
  preselectedVendor?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState(preselectedVendor || "default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const activeVendor = (preselectedVendor || vendor || 'default').toUpperCase().trim();

    // If uploading from PO management (chain-wise PO upload)
    if (preselectedVendor || vendor !== 'default') {
      try {
        let createdCount = 0;
        const fileList = Array.from(files);

        for (const file of fileList) {
          const uploadFd = new FormData();
          uploadFd.append('file', file);
          uploadFd.append('chainName', activeVendor);

          console.log(`📤 [PO UPLOAD FORM] Uploading PO file "${file.name}" for chain "${activeVendor}"...`);
          const extractRes = await fetch('/api/po/upload', { method: 'POST', body: uploadFd });
          const extractData = await extractRes.json();

          if (!extractRes.ok) {
            throw new Error(extractData.error || `Failed to extract file ${file.name}`);
          }

          let poNum = extractData.poNumber || '';
          if (!poNum || !poNum.trim()) {
            poNum = `${activeVendor}-${Date.now().toString().slice(-6)}`;
          }

          const poPayload = {
            poNumber: poNum.trim(),
            chainName: extractData.detectedChain || activeVendor,
            poDate: extractData.poDate || new Date().toISOString(),
            appointmentDate: extractData.appointmentDate || null,
            filePath: extractData.filePath || null,
            fileName: file.name,
            rawDocumentInfo: extractData.rawDocumentInfo || null,
            items: (extractData.items || []).map((i: any) => ({
              chainItemCode: i.chainItemCode || '',
              chainItemName: i.chainItemName || '',
              eanCode: i.eanCode || '',
              tallyItemName: i.tallyItemName || '',
              quantityPcs: i.quantityPcs || 0,
              unitPrice: i.unitPrice || 0,
            })),
          };

          let createRes = await fetch('/api/po', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(poPayload),
          });

          // Handle duplicate PO number by appending unique suffix
          if (createRes.status === 409) {
            poPayload.poNumber = `${poNum.trim()}-${Math.floor(1000 + Math.random() * 9000)}`;
            createRes = await fetch('/api/po', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(poPayload),
            });
          }

          if (!createRes.ok) {
            const createErr = await createRes.json();
            throw new Error(createErr.error || `Failed to save PO ${poPayload.poNumber}`);
          }

          createdCount++;
        }

        setSuccessMsg(`✅ Successfully processed and created ${createdCount} Purchase Order(s) for ${activeVendor}!`);
        setFiles(null);
        setLoading(false);

        if (onSuccess) {
          onSuccess();
        } else {
          router.refresh();
          router.push('/po');
        }
      } catch (err: any) {
        console.error('❌ [PO UPLOAD FORM ERROR]', err);
        setError(err?.message || 'PO Processing failed');
        setLoading(false);
      }
    } else {
      // Legacy generic stock record upload
      try {
        const form = new FormData();
        form.append('name', name || files[0].name);
        form.append('vendor', vendor);
        for (const file of Array.from(files)) form.append('files', file);

        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');

        router.refresh();
        router.push('/products');
      } catch (err: any) {
        setError(err?.message || 'Upload failed');
        setLoading(false);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loading && (
        <div style={{
          background: 'var(--info-bg)',
          color: 'var(--info)',
          padding: 12,
          borderRadius: 8,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span className="spinner"></span>
          <strong>Extracting PO data & creating Purchase Order for {(preselectedVendor || vendor).toUpperCase()}...</strong>
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: '#dcfce7',
          border: '1px solid #86efac',
          color: '#166534',
          fontSize: 14,
          fontWeight: 600
        }}>
          {successMsg}
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        {!preselectedVendor && (
          <>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Record name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. PO 1234 - March"
                disabled={loading}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Document Source</label>
              <select
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                style={{ width: '100%' }}
                disabled={loading}
              >
                <option value="default">Default / Auto-detect</option>
                <option value="amazon">Amazon</option>
                <option value="blinkit">Blinkit</option>
                <option value="dmart">DMart</option>
                <option value="zepto">Zepto</option>
                <option value="swiggy">Swiggy</option>
                <option value="bigbasket">BigBasket</option>
                <option value="eastern">Eastern</option>
                <option value="vishal">Vishal Mega Mart</option>
                <option value="flipkart">Flipkart</option>
              </select>
            </div>
          </>
        )}
        <div style={{ flex: preselectedVendor ? 1 : 2, minWidth: 280 }}>
          <label>Attach PO Files</label>
          <input
            type="file"
            multiple
            accept=".pdf,.csv,.xls,.xlsx,.doc,.docx"
            onChange={e => setFiles(e.target.files)}
            disabled={loading}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: '1.4' }}>
            Allowed: PDF, CSV, XLS, XLSX (Auto-extracts items, maps Tally names & creates PO record)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" disabled={loading || !files || files.length === 0} type="submit" style={{ minWidth: 160 }}>
            {loading ? 'Processing...' : 'Upload & Create PO'}
          </button>
        </div>
      </div>
      {error && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: 'var(--error-bg)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: 'var(--error)',
          fontSize: 14
        }}>
          ⚠️ {error}
        </div>
      )}
    </form>
  );
}
