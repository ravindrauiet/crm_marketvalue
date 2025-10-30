import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bhavish CRM',
  description: 'Lightweight CRM/ERP for managing records and files'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backdropFilter: 'blur(6px)' }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 12 }}>
            <a href="/" style={{ fontWeight: 700 }}>Bhavish CRM</a>
            <nav className="row" style={{ gap: 8 }}>
              <a className="btn secondary" href="/records">Records</a>
              <a className="btn secondary" href="/products">Products</a>
              <a className="btn" href="/products/import">Import Stock</a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}



