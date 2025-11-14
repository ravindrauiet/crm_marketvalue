import { getRecord } from '@/lib/records';
import FilePreview from '@/components/FilePreview';
import ExtractionStatus from '@/components/ExtractionStatus';

export default async function RecordDetail({ params }: { params: { id: string } }) {
  const record = await getRecord(params.id);
  if (!record) return <div className="container">Not found</div>;
  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>{record.name}</h2>
      <div className="row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {record.files.map(f => (
          <div key={f.id} className="card" style={{ flex: 1, minWidth: 320, marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>{f.filename}</h4>
              <ExtractionStatus fileId={f.id} status={f.extractionStatus} />
            </div>
            <FilePreview fileId={f.id} mimetype={f.mimetype} />
            {f.extractionError && (
              <div className="muted" style={{ marginTop: 12, padding: 8, background: 'rgba(255, 122, 122, 0.1)', borderRadius: 8, color: '#ff7a7a' }}>
                <strong>Extraction Error:</strong> {f.extractionError}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
