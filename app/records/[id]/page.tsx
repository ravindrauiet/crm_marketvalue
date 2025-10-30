import { getRecord } from '@/lib/records';
import FilePreview from '@/components/FilePreview';

export default async function RecordDetail({ params }: { params: { id: string } }) {
  const record = await getRecord(params.id);
  if (!record) return <div className="container">Not found</div>;
  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>{record.name}</h2>
      <div className="row" style={{ alignItems: 'stretch' }}>
        {record.files.map(f => (
          <div key={f.id} className="card" style={{ flex: 1, minWidth: 320 }}>
            <h4 style={{ marginTop: 0 }}>{f.filename}</h4>
            <FilePreview fileId={f.id} mimetype={f.mimetype} />
          </div>
        ))}
      </div>
    </div>
  );
}



