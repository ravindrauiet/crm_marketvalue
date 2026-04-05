import Link from 'next/link';
import { getDashboardStats } from '@/lib/stats';

export default async function HomePage() {
  const stats = await getDashboardStats();
  return (
    <div className="container fade-in">
      {/* Hero Section */}
      <div className="card" style={{
        padding: 36,
        background: 'linear-gradient(135deg, rgba(9, 105, 218, 0.06), rgba(139, 92, 246, 0.06))',
        borderColor: 'rgba(9, 105, 218, 0.15)',
        marginBottom: 24
      }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: 'inline-block', background: 'linear-gradient(135deg,#0969da,#8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              FMCG Distributor System
            </div>
            <h1 style={{ marginTop: 0, marginBottom: 10, fontSize: '32px' }}>BhavishCRM</h1>
            <p className="muted" style={{ marginTop: 0, marginBottom: 20, fontSize: '15px', lineHeight: '1.7' }}>
              Automate your FMCG distribution operations — from chain PO tracking to shortfall calculation, OCR bill import, payment reconciliation, and Tally sync.
            </p>
            <div className="row" style={{ gap: 10 }}>
              <Link className="btn" href="/po" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>📦 Manage POs</Link>
              <Link className="btn secondary" href="/shortfall">⚡ Shortfall</Link>
              <Link className="btn secondary" href="/purchase-bills">🧾 Bill OCR</Link>
              <Link className="btn secondary" href="/reconciliation">💰 Reconcile</Link>
            </div>
          </div>
          {/* Stats */}
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Products', value: stats.products, color: '#0969da' },
              { label: 'Total Stock', value: stats.totalStock, color: '#10b981' },
              { label: 'Out of Stock', value: stats.outOfStock || 0, color: '#ef4444' },
              { label: 'Records', value: stats.records, color: '#8b5cf6' },
            ].map(s => (
              <div key={s.label} className="card" style={{ minWidth: 120, padding: 18, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: '11px', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FMCG Module Grid */}
      <h2 style={{ marginBottom: 16, fontSize: 18 }}>FMCG Automation Modules</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          {
            icon: '🔗', title: 'Item Mapping Master', href: '/item-mapping',
            desc: 'Map chain codes ↔ Tally SKU ↔ Company codes. Setup PCS/CASE conversion ratios.',
            color: '#6366f1', bg: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))', border: 'rgba(99,102,241,0.2)'
          },
          {
            icon: '📦', title: 'PO Management', href: '/po',
            desc: 'Track incoming POs from Flipkart, Amazon, Zepto, Blinkit. Multi-select for shortfall.',
            color: '#f59e0b', bg: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(239,68,68,0.05))', border: 'rgba(245,158,11,0.2)'
          },
          {
            icon: '⚡', title: 'Shortfall Calculator', href: '/shortfall',
            desc: 'Select active POs → auto-calculate stock shortfall → generate company purchase order.',
            color: '#10b981', bg: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.05))', border: 'rgba(16,185,129,0.2)'
          },
          {
            icon: '🧾', title: 'Purchase Bills OCR', href: '/purchase-bills',
            desc: 'Upload PDF or image bills → AI extracts data → verify → auto-post to Tally as Purchase Voucher.',
            color: '#d97706', bg: 'linear-gradient(135deg, rgba(217,119,6,0.08), rgba(245,158,11,0.05))', border: 'rgba(217,119,6,0.2)'
          },
          {
            icon: '💰', title: 'Payment Reconciliation', href: '/reconciliation',
            desc: 'Upload bank statement → auto-match invoices/POs → Paid/Partial/Pending status dashboard.',
            color: '#0ea5e9', bg: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(99,102,241,0.05))', border: 'rgba(14,165,233,0.2)'
          },
          {
            icon: '📊', title: 'Analytics & Reports', href: '/analytics',
            desc: 'Sales analytics, stock reports, revenue tracking and low-stock alerts dashboard.',
            color: '#8b5cf6', bg: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05))', border: 'rgba(139,92,246,0.2)'
          },
        ].map(m => (
          <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ height: '100%', background: m.bg, borderColor: m.border, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 32 }}>{m.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: m.color }}>{m.title}</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: '1.6', flex: 1 }}>{m.desc}</div>
              <div style={{ color: m.color, fontSize: 13, fontWeight: 600 }}>Open →</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Flow Diagram */}
      <div className="card" style={{ padding: 28, marginBottom: 24, background: 'linear-gradient(135deg, rgba(15,23,42,0.03), rgba(30,41,59,0.02))' }}>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>🔄 Automation Flow</h3>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
          {[
            { icon: '📥', label: 'PO Received', sub: 'Email/Portal' },
            { icon: '🔗', label: 'Item Mapping', sub: 'Code Standardization' },
            { icon: '📦', label: 'Stock Check', sub: 'Tally Integration' },
            { icon: '⚡', label: 'Shortfall Calc', sub: 'PCS → Cases' },
            { icon: '🏭', label: 'Company PO', sub: 'Auto Generate' },
            { icon: '🧾', label: 'Bill OCR', sub: 'PDF/Image → Tally' },
            { icon: '🚚', label: 'Dispatch', sub: 'Invoice + Gate Pass' },
            { icon: '💰', label: 'Reconciliation', sub: 'Bank Statement Match' },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '8px 12px' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{step.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{step.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{step.sub}</div>
              </div>
              {i < arr.length - 1 && <div style={{ color: 'var(--border)', fontSize: 18, margin: '0 2px' }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links Row */}
      <div className="row" style={{ gap: 16 }}>
        <div className="card" style={{ flex: 2, minWidth: 280 }}>
          <h3 style={{ marginTop: 0, marginBottom: 14 }}>Quick Links</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['/orders', '📋 Orders'], ['/invoices', '📄 Invoices'],
              ['/customers', '👥 Customers'], ['/products', '📦 Products'],
              ['/payments', '💳 Payments'], ['/grn', '📥 GRN'],
              ['/records', '📂 Records'], ['/products/import', '⚡ Import Stock'],
            ].map(([href, label]) => (
              <Link key={href} href={href as string} className="btn secondary" style={{ justifyContent: 'flex-start', fontSize: 13, padding: '8px 12px' }}>{label}</Link>
            ))}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ marginTop: 0, marginBottom: 14 }}>Setup Guide</h3>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: '2.2', fontSize: 13 }}>
            <li><Link href="/item-mapping" style={{ color: 'var(--primary)' }}>Set up Item Mappings</Link> first</li>
            <li><Link href="/products/import" style={{ color: 'var(--primary)' }}>Import Stock</Link> from Tally</li>
            <li><Link href="/po/new" style={{ color: 'var(--primary)' }}>Create a PO</Link> from chain</li>
            <li><Link href="/shortfall" style={{ color: 'var(--primary)' }}>Calculate Shortfall</Link></li>
            <li><Link href="/purchase-bills" style={{ color: 'var(--primary)' }}>Upload bill</Link> for Tally import</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
