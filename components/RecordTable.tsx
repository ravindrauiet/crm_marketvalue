import Link from 'next/link';

export type RecordRow = {
  id: string;
  name: string;
  createdAt: string;
  files: { id: string; filename: string; mimetype: string }[];
};

export default function RecordTable({ records }: { records: RecordRow[] }) {
  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Files</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                {r.files.map(f => (
                  <div key={f.id} className="muted" style={{ fontSize: 12 }}>
                    {f.filename} ({f.mimetype})
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



