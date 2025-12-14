import Link from 'next/link';

export type RecordRow = {
  id: string;
  name: string;
  createdAt: string;
  files: { id: string; filename: string; mimetype: string; extractionStatus?: string }[];
};

function getExtractionStatusBadge(status?: string) {
  if (!status) return null;
  switch (status) {
    case 'COMPLETED':
      return <span className="badge success">Extracted</span>;
    case 'PROCESSING':
      return <span className="badge info">Processing</span>;
    case 'FAILED':
      return <span className="badge error">Failed</span>;
    case 'PENDING':
      return <span className="badge">Pending</span>;
    default:
      return null;
  }
}

export default function RecordTable({ records }: { records: RecordRow[] }) {
  return (
    <div>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Name</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Files</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>AI Status</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Created</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover:bg-slate-50">
              <td style={{ padding: '16px 24px', fontWeight: 500 }}>{r.name}</td>
              <td style={{ padding: '16px 24px' }}>
                {r.files.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No files attached</span>}
                {r.files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>
                      {f.mimetype.includes('pdf') ? '📄' : f.mimetype.includes('spreadsheet') || f.mimetype.includes('excel') ? '📊' : '📁'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.filename}</span>
                  </div>
                ))}
              </td>
              <td style={{ padding: '16px 24px' }}>
                {r.files.map(f => (
                  <div key={f.id} style={{ marginBottom: 4 }}>
                    {getExtractionStatusBadge(f.extractionStatus)}
                  </div>
                ))}
              </td>
              <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: 13 }}>
                {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                <div style={{ fontSize: 11, opacity: 0.7 }}>{new Date(r.createdAt).toLocaleTimeString()}</div>
              </td>
              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                <Link
                  href={`/records/${r.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--primary)',
                    background: 'var(--info-bg)',
                    transition: 'all 0.2s'
                  }}
                >
                  View Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && (
        <div style={{ padding: 64, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No records found</h3>
          <p className="muted">Upload your first document to get started.</p>
        </div>
      )}
    </div>
  );
}



