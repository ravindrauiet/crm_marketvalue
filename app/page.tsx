import Link from 'next/link';
import { getDashboardStats } from '@/lib/stats';

export default async function HomePage() {
  const stats = await getDashboardStats();
  return (
    <div className="container fade-in">
      <div className="card" style={{
        padding: 32,
        background: 'linear-gradient(135deg, rgba(9, 105, 218, 0.08), rgba(9, 105, 218, 0.03))',
        borderColor: 'rgba(9, 105, 218, 0.2)',
        marginBottom: 24
      }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ maxWidth: 600, flex: 1 }}>
            <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: '36px' }}>Welcome to CRM Marketplace</h1>
            <p className="muted" style={{ marginTop: 0, marginBottom: 24, fontSize: '16px', lineHeight: '1.6' }}>
              Manage records, import products and track stock quickly from one place.
              AI-powered document extraction makes data entry effortless.
            </p>
            <div className="row" style={{ gap: 12, marginTop: 24 }}>
              <Link className="btn" href="/products/import">Import Stock</Link>
              <Link className="btn secondary" href="/products">View Products</Link>
              <Link className="btn secondary" href="/records">Manage Records</Link>
            </div>
          </div>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <div className="card" style={{
              minWidth: 140,
              padding: 20,
              background: 'var(--bg)',
              border: '1px solid var(--border)'
            }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Records</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>{stats.records}</div>
            </div>
            <div className="card" style={{
              minWidth: 140,
              padding: 20,
              background: 'var(--bg)',
              border: '1px solid var(--border)'
            }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Products</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>{stats.products}</div>
            </div>
            <div className="card" style={{
              minWidth: 140,
              padding: 20,
              background: 'var(--bg)',
              border: '1px solid var(--border)'
            }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Stock</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>{stats.totalStock}</div>
            </div>
            <div className="card" style={{
              minWidth: 140,
              padding: 20,
              background: 'var(--bg)',
              border: '1px solid var(--border)'
            }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Out of Stock</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--warning)' }}>{stats.outOfStock || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 24, gap: 24 }}>
        <div className="card" style={{ flex: 2, minWidth: 300 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Quick Start</h3>
          <ol style={{ marginTop: 0, paddingLeft: 20, lineHeight: '2' }}>
            <li style={{ marginBottom: 12 }}>Go to <strong>Import Stock</strong> and upload your Excel file.</li>
            <li style={{ marginBottom: 12 }}>Review <strong>Products</strong> list and search by SKU, name, brand, or group.</li>
            <li style={{ marginBottom: 12 }}>Upload PDFs/XLS to a <strong>Record</strong> for AI-powered document extraction.</li>
          </ol>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 250 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Quick Links</h3>
          <div className="row" style={{ gap: 8, flexDirection: 'column', alignItems: 'stretch' }}>
            <Link className="btn secondary" href="/products" style={{ width: '100%', justifyContent: 'center' }}>Products</Link>
            <Link className="btn secondary" href="/products/import" style={{ width: '100%', justifyContent: 'center' }}>Import</Link>
            <Link className="btn secondary" href="/records" style={{ width: '100%', justifyContent: 'center' }}>Records</Link>
          </div>
        </div>
      </div>
    </div>
  );
}



