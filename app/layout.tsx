import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CRM Marketplace',
  description: 'Lightweight CRM/ERP for managing records and files'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          backdropFilter: 'blur(12px) saturate(180%)',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 1000
        }}>
          <div className="container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 16,
            paddingBottom: 16
          }}>
            <a href="/" style={{
              fontWeight: 700,
              letterSpacing: '-0.02em',
              fontSize: '20px',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>CRM Marketplace</a>
            <nav className="row" style={{ gap: 12 }}>
              <a className="btn secondary" href="/records">Records</a>
              <a className="btn secondary" href="/products">Products</a>
              <a className="btn secondary" href="/customers">Customers</a>
              <a className="btn secondary" href="/orders">Orders</a>
              <a className="btn secondary" href="/analytics">Analytics</a>
              <a className="btn" href="/products/import">Import Stock</a>
            </nav>
          </div>
        </header>
        {children}

        <footer style={{
          marginTop: 80,
          background: 'linear-gradient(to bottom, #111827, #0f172a)',
          color: '#e5e7eb',
          padding: '64px 0 32px 0',
          fontSize: '14px',
          borderTop: '1px solid #1f2937'
        }}>
          <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 48 }}>

            {/* Brand Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: '#fff', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  BhavishCRM <span style={{ fontSize: '10px', padding: '2px 6px', background: '#374151', borderRadius: '4px', color: '#9ca3af' }}>v1.0</span>
                </div>
                <p style={{ marginTop: 8, color: '#9ca3af', lineHeight: 1.6, maxWidth: '240px' }}>
                  Enterprise-grade management for orders, intelligent billing, and automated inventory tracking.
                </p>
              </div>
            </div>

            {/* Links Columns - Improved Typography */}
            <div style={{ borderLeft: '1px solid #1f2937', paddingLeft: 32 }}>
              <h4 style={{ color: '#fff', marginBottom: 20, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operations</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/orders" className="footer-link">📦  Orders Management</a>
                <a href="/products" className="footer-link">🏷️  Product Catalog</a>
                <a href="/customers" className="footer-link">👥  Customer Base</a>
                <a href="/records" className="footer-link">📂  Document Archive</a>
              </div>
            </div>

            <div style={{ borderLeft: '1px solid #1f2937', paddingLeft: 32 }}>
              <h4 style={{ color: '#fff', marginBottom: 20, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Finance Suite</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/invoices" className="footer-link">📄  Invoices & Tally</a>
                <a href="/payments" className="footer-link">💰  Payment Ledger</a>
                <a href="/grn" className="footer-link">📥  GRN Verification</a>
                <a href="/analytics" className="footer-link">📊  Financial Reports</a>
              </div>
            </div>

            <div style={{ borderLeft: '1px solid #1f2937', paddingLeft: 32 }}>
              <h4 style={{ color: '#fff', marginBottom: 20, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Utilities</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/products/import" className="footer-link">⚡  Bulk Import</a>
                <a href="/records" className="footer-link">📤  Smart Upload</a>
                <a href="#" className="footer-link" style={{ opacity: 0.5, cursor: 'not-allowed' }}>⚙️  Settings (Soon)</a>
              </div>
            </div>

          </div>

          <div className="container" style={{
            marginTop: 64,
            paddingTop: 32,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#6b7280',
            fontSize: '13px'
          }}>
            <div>© {new Date().getFullYear()} BhavishCRM Suite. All rights reserved.</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Support</span>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{
            __html: `
            .footer-link { color: #d1d5db; text-decoration: none; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
            .footer-link:hover { color: #fff; transform: translateX(4px); }
          `}} />
        </footer>
      </body>
    </html>
  );
}


