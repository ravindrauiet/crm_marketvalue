import Link from 'next/link';
import { getDashboardStats } from '@/lib/stats';

export default async function HomePage() {
  const stats = await getDashboardStats();
  return (
    <div className="container">
      <div className="card" style={{
        padding: 24,
        background: 'linear-gradient(135deg, #0f1632, #151e42)',
        borderColor: 'rgba(255,255,255,0.06)'
      }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ maxWidth: 640 }}>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Welcome to Bhavish CRM</h1>
            <p className="muted" style={{ marginTop: 0 }}>Manage records, import products and track stock quickly from one place.</p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Link className="btn" href="/products/import">Import Stock</Link>
              <Link className="btn secondary" href="/products">View Products</Link>
              <Link className="btn secondary" href="/records">Manage Records</Link>
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="card" style={{ minWidth: 160 }}>
              <div className="muted">Records</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.records}</div>
            </div>
            <div className="card" style={{ minWidth: 160 }}>
              <div className="muted">Products</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.products}</div>
            </div>
            <div className="card" style={{ minWidth: 160 }}>
              <div className="muted">Total Stock</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalStock}</div>
            </div>
            <div className="card" style={{ minWidth: 160 }}>
              <div className="muted">Out of Stock</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ffd48a' }}>{stats.outOfStock || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: 2 }}>
          <h3 style={{ marginTop: 0 }}>Quick Start</h3>
          <ol style={{ marginTop: 8 }}>
            <li>Go to Import Stock and upload your Excel.</li>
            <li>Review Products list and search by SKU/name.</li>
            <li>Upload PDFs/XLS to a Record for documentation.</li>
          </ol>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 style={{ marginTop: 0 }}>Shortcuts</h3>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn secondary" href="/products">Products</Link>
            <Link className="btn secondary" href="/products/import">Import</Link>
            <Link className="btn secondary" href="/records">Records</Link>
          </div>
        </div>
      </div>
    </div>
  );
}



