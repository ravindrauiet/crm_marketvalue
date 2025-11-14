"use client";
import { useEffect, useState } from 'react';

export default function FilePreview({ fileId, mimetype }: { fileId: string; mimetype: string }) {
  const [content, setContent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (mimetype.includes('pdf')) {
          setContent(`/api/files/${fileId}`);
          return;
        }
        const res = await fetch(`/api/files/${fileId}/summary`);
        if (!res.ok) throw new Error('Failed summary');
        const data = await res.json();
        if (!cancelled) setContent(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fileId, mimetype]);

  if (error) return <div className="muted">{error}</div>;

  if (mimetype.includes('pdf')) {
    return (
      <iframe src={String(content)} style={{ width: '100%', height: 500, border: 0, background: '#fff' }} />
    );
  }

  if (!content) return <div className="muted">Loading...</div>;

  return (
    <div>
      <div className="muted" style={{ marginBottom: 8 }}>Excel summary (first sheet)</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {content.headers.map((h: string, idx: number) => (
                <th key={idx}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row: any[], rIdx: number) => (
              <tr key={rIdx}>
                {row.map((cell: any, cIdx: number) => (
                  <td key={cIdx}>{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}







