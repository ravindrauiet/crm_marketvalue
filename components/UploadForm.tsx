"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadForm({ preselectedVendor }: { preselectedVendor?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState(preselectedVendor || "default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name || files[0].name);
      form.append('vendor', vendor);
      for (const file of Array.from(files)) form.append('files', file);

      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');

      // Success! Redirect to products page
      router.refresh(); // Refresh server components to show new data
      router.push('/products');

    } catch (err: any) {
      setError(err?.message || 'Upload failed');
      setLoading(false); // Only stop loading on error, otherwise keep showing it during redirect
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
          <strong>Analyzing Document with AI... this may take a moment.</strong>
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <label>Record name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. PO 1234 - March"
            disabled={loading}
          />
        </div>
        {!preselectedVendor && (
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
              <option value="eastern">Eastern</option>
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: '1.5' }}>
              Select vendor for better extraction accuracy
            </div>
          </div>
        )}
        <div style={{ flex: 2, minWidth: 300 }}>
          <label>Attach files</label>
          <input
            type="file"
            multiple
            accept=".pdf,.xls,.xlsx,.doc,.docx"
            onChange={e => setFiles(e.target.files)}
            disabled={loading}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: '1.5' }}>
            Allowed: PDF, XLS, XLSX, DOC, DOCX (AI will extract product data automatically)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" disabled={loading} type="submit" style={{ minWidth: 160 }}>
            {loading ? 'Analyzing...' : 'Upload & Process'}
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
          {error}
        </div>
      )}
    </form>
  );
}



