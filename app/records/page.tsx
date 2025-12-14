import UploadForm from '@/components/UploadForm';
import RecordTable from '@/components/RecordTable';
import { listRecords } from '@/lib/records';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const records = await listRecords();

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Records Archive</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 600 }}>
            Manage your document history, track AI extraction status, and upload new files for processing.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--primary)' }}>{records.length}</div>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Total Documents</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 32 }}>
        <div className="card" style={{
          background: 'linear-gradient(to right bottom, var(--panel), var(--bg-secondary))',
          borderLeft: '4px solid var(--primary)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Upload New Documents</h3>
          <UploadForm />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Recent Activity</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <RecordTable records={records} />
          </div>
        </div>
      </div>
    </div>
  );
}







