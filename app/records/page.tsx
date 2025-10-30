import UploadForm from '@/components/UploadForm';
import RecordTable from '@/components/RecordTable';
import { listRecords } from '@/lib/records';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const records = await listRecords();
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Records</h2>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <UploadForm />
      </div>
      <div className="card">
        <RecordTable records={records} />
      </div>
    </div>
  );
}



