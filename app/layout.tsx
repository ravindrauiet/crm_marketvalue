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
      </body>
    </html>
  );
}



