import Link from 'next/link';
import Icon from '@/components/Icon';
import { formatINR, getDashboardData } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export default async function DashboardPage() {
  const d = await getDashboardData();
  const maxParty = Math.max(1, ...d.salesByParty.map(p => p.value));

  const attention = [
    { show: d.billsFailed > 0, tone: 'error', icon: 'alert', text: `${d.billsFailed} purchase bill(s) failed extraction`, href: '/purchase-bills', cta: 'Retry' },
    { show: d.billsAwaitingReview > 0, tone: 'warn', icon: 'bills', text: `${d.billsAwaitingReview} purchase bill(s) awaiting review`, href: '/purchase-bills', cta: 'Review' },
    { show: d.billsDuplicate > 0, tone: 'warn', icon: 'bills', text: `${d.billsDuplicate} possible duplicate bill(s)`, href: '/purchase-bills', cta: 'Check' },
    { show: d.duePos > 0, tone: 'warn', icon: 'clock', text: `${d.duePos} open PO(s) due within 7 days`, href: '/po', cta: 'View' },
    { show: d.recoUnmatched > 0, tone: 'warn', icon: 'reco', text: `${d.recoUnmatched} payment line(s) unmatched`, href: '/reconciliation', cta: 'Match' },
    { show: d.outOfStock > 0, tone: 'error', icon: 'products', text: `${d.outOfStock} product(s) out of stock`, href: '/products?status=OUT_OF_STOCK', cta: 'View' },
    { show: d.lowStock > 0, tone: 'warn', icon: 'products', text: `${d.lowStock} product(s) low on stock`, href: '/products?status=LOW_STOCK', cta: 'View' },
    { show: d.productsCount === 0, tone: 'info', icon: 'import', text: 'No stock loaded yet — import the Tally closing stock', href: '/products/import', cta: 'Import' },
  ].filter(a => a.show);

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Chain POs, deliveries, payments and stock at a glance.</p>
        </div>
        <div className="page-actions">
          <Link href="/po/reconciliation-report" className="btn secondary"><Icon name="fillRate" size={16} />Fill Rate Report</Link>
          <Link href="/po/new" className="btn"><Icon name="plus" size={16} />New PO</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <Link href="/po/reconciliation-report" className="kpi">
          <span className="kpi-label"><Icon name="invoices" size={15} />Sales billed · {d.salesMonthLabel}</span>
          <span className="kpi-value">{formatINR(d.salesValue, true)}</span>
          <span className="kpi-foot">{d.salesInvoices.toLocaleString('en-IN')} invoices from Tally uploads</span>
        </Link>
        <Link href="/po" className="kpi">
          <span className="kpi-label"><Icon name="po" size={15} />Open purchase orders</span>
          <span className="kpi-value">{d.openPoCount}</span>
          <span className="kpi-foot">{formatINR(d.openPoValue, true)} order value</span>
        </Link>
        <Link href="/reconciliation" className="kpi">
          <span className="kpi-label"><Icon name="reco" size={15} />Payments pending</span>
          <span className="kpi-value">{formatINR(d.recoPending, true)}</span>
          <span className="kpi-foot">{d.recoUnmatched} unmatched lines</span>
        </Link>
        <Link href="/products" className="kpi">
          <span className="kpi-label"><Icon name="products" size={15} />Stock alerts</span>
          <span className="kpi-value">{d.outOfStock + d.lowStock}</span>
          <span className="kpi-foot">{d.outOfStock} out of stock · {d.lowStock} low · {d.productsCount} products</span>
        </Link>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Sales by chain */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Sales by chain</h2>
              <p className="card-subtitle">Billed value, {d.salesMonthLabel}</p>
            </div>
            <Link href="/po/reconciliation-report" className="btn ghost sm">Details <Icon name="arrowRight" size={14} /></Link>
          </div>
          {d.salesByParty.length === 0 ? (
            <div className="empty-state">No sale invoices uploaded yet. Upload the daily Tally sale report from the Fill Rate page.</div>
          ) : (
            <div className="bar-list" role="list">
              {d.salesByParty.map(p => (
                <div key={p.label} className="bar-row" role="listitem" title={`${p.label}: ${formatINR(p.value)}`}>
                  <span className="bar-label">{p.label}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.value / maxParty) * 100}%` }} /></div>
                  <span className="bar-value">{formatINR(p.value, true)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Needs attention */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Needs attention</h2>
              <p className="card-subtitle">Items waiting on someone</p>
            </div>
          </div>
          {attention.length === 0 ? (
            <div className="empty-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="check" size={16} style={{ color: 'var(--success)' }} /> All clear — nothing needs action right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attention.map(a => (
                <div key={a.text} className={`alert ${a.tone}`} style={{ alignItems: 'center' }}>
                  <Icon name={a.icon} size={16} />
                  <span style={{ flex: 1 }}>{a.text}</span>
                  <Link href={a.href} className="btn secondary sm">{a.cta}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent POs */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '16px 20px 0' }}>
          <div>
            <h2 className="card-title">Recent purchase orders</h2>
            <p className="card-subtitle">Latest chain POs received</p>
          </div>
          <Link href="/po" className="btn ghost sm">All POs <Icon name="arrowRight" size={14} /></Link>
        </div>
        {d.recentPos.length === 0 ? (
          <div className="empty-state">No purchase orders yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>PO number</th>
                  <th>Chain</th>
                  <th>PO date</th>
                  <th>Appointment / expiry</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.recentPos.map(po => (
                  <tr key={po.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{po.poNumber}</td>
                    <td>{po.chainName}</td>
                    <td>{fmtDate(po.poDate)}</td>
                    <td>{fmtDate(po.appointmentDate || po.deliveryDate)}</td>
                    <td className="num">{formatINR(po.totalAmount)}</td>
                    <td><span className="badge info">{po.status.charAt(0) + po.status.slice(1).toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
