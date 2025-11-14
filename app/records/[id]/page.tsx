import { getRecord } from '@/lib/records';
import FilePreview from '@/components/FilePreview';
import ExtractionStatus from '@/components/ExtractionStatus';

export default async function RecordDetail({ params }: { params: { id: string } }) {
  const record = await getRecord(params.id);
  if (!record) return <div className="container">Not found</div>;
  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{record.name}</h2>
        <div className="muted" style={{ fontSize: 14 }}>
          Created {new Date(record.createdAt).toLocaleString()}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'stretch', flexWrap: 'wrap', gap: 24 }}>
        {record.files.map(f => (
          <div key={f.id} className="card" style={{ flex: 1, minWidth: 400 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{f.filename}</h4>
              <ExtractionStatus fileId={f.id} status={f.extractionStatus} />
            </div>
            <FilePreview fileId={f.id} mimetype={f.mimetype} />
            {f.extractionError && (
              <div style={{ 
                marginTop: 16, 
                padding: 12, 
                background: 'var(--error-bg)', 
                borderRadius: 8, 
                border: '1px solid rgba(248, 81, 73, 0.3)',
                color: 'var(--error)',
                fontSize: 13
              }}>
                <strong>Extraction Error:</strong> {f.extractionError}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
