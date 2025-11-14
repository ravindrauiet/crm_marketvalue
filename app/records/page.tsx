import UploadForm from '@/components/UploadForm';
import RecordTable from '@/components/RecordTable';
import { listRecords } from '@/lib/records';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const records = await listRecords();
  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Records</h2>
      </div>
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Upload Documents</h3>
        <UploadForm />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>All Records</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <RecordTable records={records} />
        </div>
      </div>
    </div>
  );
}







