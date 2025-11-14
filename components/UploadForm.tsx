"use client";
import { useState } from 'react';

export default function UploadForm() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [name, setName] = useState("");
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
      for (const file of Array.from(files)) form.append('files', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="row" style={{ alignItems: 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <label>Record name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. PO 1234 - March" style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} />
      </div>
      <div style={{ flex: 2, minWidth: 280 }}>
        <label>Attach files</label>
        <input type="file" multiple accept=".pdf,.xls,.xlsx,.doc,.docx" onChange={e => setFiles(e.target.files)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Allowed: PDF, XLS, XLSX, DOC, DOCX (AI will extract product data automatically)</div>
      </div>
      <button className="btn" disabled={loading} type="submit">{loading ? 'Uploading...' : 'Upload'}</button>
      {error && <div className="muted" style={{ color: '#ff7a7a' }}>{error}</div>}
    </form>
  );
}



