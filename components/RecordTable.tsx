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
      return <span className="badge success" style={{ fontSize: 10 }}>Extracted</span>;
    case 'PROCESSING':
      return <span className="badge info" style={{ fontSize: 10 }}>Processing</span>;
    case 'FAILED':
      return <span className="badge warn" style={{ fontSize: 10 }}>Failed</span>;
    case 'PENDING':
      return <span className="badge" style={{ fontSize: 10 }}>Pending</span>;
    default:
      return null;
  }
}

export default function RecordTable({ records }: { records: RecordRow[] }) {
  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Files</th>
            <th>AI Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                {r.files.length === 0 && <span className="badge warn">No files</span>}
                {r.files.map(f => (
                  <div key={f.id} className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span className="badge info" title={f.mimetype}>{f.mimetype.includes('pdf') ? 'PDF' : f.mimetype.includes('word') || f.mimetype.includes('document') ? 'DOC' : 'Excel'}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{f.filename}</span>
                  </div>
                ))}
              </td>
              <td>
                {r.files.map(f => (
                  <div key={f.id} style={{ marginBottom: 4 }}>
                    {getExtractionStatusBadge(f.extractionStatus)}
                  </div>
                ))}
              </td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn secondary" href={`/records/${r.id}`}>Open</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && <div className="muted">No records yet. Upload files to create one.</div>}
    </div>
  );
}



