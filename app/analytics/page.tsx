import Link from 'next/link';
import Icon from '@/components/Icon';
import HelpToggle from '@/components/HelpToggle';
import { getAnalytics } from '@/lib/analytics';
import { formatINR } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const TX_LABEL: Record<string, string> = { IN: 'Stock added', OUT: 'Stock removed', ADJUSTMENT: 'Stock adjusted' };
const REASON_LABEL: Record<string, string> = { IMPORT: 'File import', PURCHASE: 'Purchase', SALE: 'Sale', RETURN: 'Return', ADJUSTMENT: 'Manual adjustment' };

function fmtDateTime(d: Date) {
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '';
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { month?: string } }) {
  const { sales, stock, activity } = await getAnalytics(searchParams.month || 'latest');

  const maxMonth = Math.max(1, ...sales.monthly.map(m => m.value));
  const chains = sales.byChain.slice(0, 8);
  const otherChains = sales.byChain.slice(8);
  if (otherChains.length) chains.push({ label: `Other (${otherChains.length})`, value: otherChains.reduce((s, c) => s + c.value, 0) });
  const maxChain = Math.max(1, ...chains.map(c => c.value));
  const stockAlerts = stock.lowStock + stock.outOfStock;
  const periodHref = (key: string) => `/analytics?month=${key}`;

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Sales trends by month, chain and product, plus inventory health.</p>
        </div>
        <div className="page-actions">
          <HelpToggle />
        </div>
      </div>

      {/* Period picker */}
      <div className="period-bar" role="group" aria-label="Sales period">
        <span className="period-label">Period</span>
        {sales.monthly.map(m => (
          <Link key={m.key} href={periodHref(m.key)} className={`period-pill${sales.period === m.key ? ' active' : ''}`} aria-current={sales.period === m.key ? 'true' : undefined}>
            {m.label}
          </Link>
        ))}
        <Link href={periodHref('all')} className={`period-pill${sales.period === 'all' ? ' active' : ''}`} aria-current={sales.period === 'all' ? 'true' : undefined}>
          All time
        </Link>
      </div>
      <p className="help-text section-help">
        Pick a month to update the sales numbers, chains and products below. Only months with uploaded Tally sale data appear.
        Stock figures always show the current position.
      </p>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label"><Icon name="invoices" size={15} />Sales billed · {sales.periodLabel}</span>
          <span className="kpi-value">{formatINR(sales.totalRevenue, true)}</span>
          <span className="kpi-foot">across {sales.chainCount} chain{sales.chainCount === 1 ? '' : 's'}</span>
          <span className="help-text kpi-help">Total invoice value billed to chains, from the daily Tally sale reports.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><Icon name="po" size={15} />Invoices</span>
          <span className="kpi-value">{sales.totalInvoices.toLocaleString('en-IN')}</span>
          <span className="kpi-foot">Avg. {formatINR(sales.averageInvoiceValue)} per invoice</span>
          <span className="help-text kpi-help">Number of sale invoices raised, and the average value of one invoice.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><Icon name="orders" size={15} />Units sold</span>
          <span className="kpi-value">{Math.round(sales.totalUnits).toLocaleString('en-IN')}</span>
          <span className="kpi-foot">pieces/cases as billed</span>
          <span className="help-text kpi-help">Total quantity across all invoice lines, in the unit used on each invoice.</span>
        </div>
        <Link href="/products" className="kpi">
          <span className="kpi-label"><Icon name="stock" size={15} />Inventory value</span>
          <span className="kpi-value">{formatINR(stock.totalValue, true)}</span>
          <span className="kpi-foot">
            {stock.totalProducts} products{stock.missingCost > 0 ? ` · ${stock.missingCost} without cost price` : ''}
          </span>
          <span className="help-text kpi-help">Current stock × cost price. Products with no cost price are not counted.</span>
        </Link>
        <Link href="/products" className="kpi">
          <span className="kpi-label">
            <Icon name="products" size={15} />Stock health
            <span className={`status-dot ${stock.outOfStock > 0 ? 'error' : stock.lowStock > 0 ? 'warn' : 'success'}`} aria-hidden="true" />
          </span>
          <span className="kpi-value">{stockAlerts > 0 ? `${stockAlerts} alert${stockAlerts === 1 ? '' : 's'}` : 'Healthy'}</span>
          <span className="kpi-foot">{stock.outOfStock} out · {stock.lowStock} low · {stock.inStock} in stock</span>
          <span className="help-text kpi-help">Products at zero (out) or at/below their minimum level (low).</span>
        </Link>
      </div>

      {/* Monthly trend */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Sales by month</h2>
            <p className="card-subtitle">Billed value per month, all uploaded data</p>
          </div>
        </div>
        <p className="help-text card-help">
          How sales are moving month to month. The highlighted bar is the month you selected; click a month to switch to it.
          A month with very low sales may just mean its Tally reports were not fully uploaded.
        </p>
        {sales.monthly.length === 0 ? (
          <div className="empty-state">No sale invoices uploaded yet. Upload the daily Tally sale report from the <Link href="/po/reconciliation-report" style={{ color: 'var(--primary)' }}>Fill Rate page</Link>.</div>
        ) : (
          <div className="bar-list" role="list">
            {sales.monthly.map(m => (
              <Link
                key={m.key}
                href={periodHref(m.key)}
                className={`bar-row bar-link${sales.period === 'all' || sales.period === m.key ? '' : ' dim'}`}
                role="listitem"
                title={`${m.label}: ${formatINR(m.value)} from ${m.invoices} invoices`}
              >
                <span className="bar-label">{m.label}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(m.value / maxMonth) * 100}%` }} /></div>
                <span className="bar-value">
                  {formatINR(m.value, true)}
                  <span className="bar-share">{m.invoices} inv</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Sales by chain */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Sales by chain</h2>
              <p className="card-subtitle">Billed value, {sales.periodLabel}</p>
            </div>
            <Link href="/po/reconciliation-report" className="btn ghost sm">Fill Rate <Icon name="arrowRight" size={14} /></Link>
          </div>
          <p className="help-text card-help">Which customers (chains) bring in the most sales. The % is each chain’s share of the period total.</p>
          {chains.length === 0 ? (
            <div className="empty-state">No sales in this period.</div>
          ) : (
            <div className="bar-list" role="list">
              {chains.map(c => (
                <div key={c.label} className="bar-row" role="listitem" title={`${c.label}: ${formatINR(c.value)}`}>
                  <span className="bar-label">{c.label}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.value / maxChain) * 100}%` }} /></div>
                  <span className="bar-value">
                    {formatINR(c.value, true)}
                    <span className="bar-share">{pct(c.value, sales.totalRevenue)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: '16px 20px 0' }}>
            <div>
              <h2 className="card-title">Top 10 products</h2>
              <p className="card-subtitle">By billed value, {sales.periodLabel}</p>
            </div>
          </div>
          <p className="help-text card-help" style={{ padding: '0 20px' }}>Your best sellers by sales value, with the quantity billed and their share of total sales.</p>
          {sales.topProducts.length === 0 ? (
            <div className="empty-state">No product lines in this period.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Value</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.topProducts.map((p, i) => (
                    <tr key={p.name}>
                      <td className="muted">{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td className="num">{Math.round(p.quantity).toLocaleString('en-IN')}</td>
                      <td className="num">{formatINR(p.revenue)}</td>
                      <td className="num muted">{pct(p.revenue, sales.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Stock alerts */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Stock alerts</h2>
              <p className="card-subtitle">Out of stock first, then lowest quantity</p>
            </div>
            {stockAlerts > 0 && <Link href="/products?status=OUT_OF_STOCK" className="btn ghost sm">All {stockAlerts} <Icon name="arrowRight" size={14} /></Link>}
          </div>
          <p className="help-text card-help">
            Products you may not be able to supply. <strong>Out</strong> = zero stock; <strong>Low</strong> = at or below the minimum level.
            Refresh with a new <Link href="/products/import" style={{ color: 'var(--primary)' }}>stock import</Link>.
          </p>
          {stock.totalProducts === 0 ? (
            <div className="empty-state">No products yet. <Link href="/products/import" style={{ color: 'var(--primary)' }}>Import the Tally closing stock</Link>.</div>
          ) : stock.alerts.length === 0 ? (
            <div className="empty-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="check" size={16} style={{ color: 'var(--success)' }} /> All products are above their minimum stock level.
            </div>
          ) : (
            <ul className="stack-list">
              {stock.alerts.map(p => (
                <li key={p.id} className="stack-item">
                  <span style={{ minWidth: 0 }}>
                    <span className="stack-title">{p.name}</span>
                    <span className="stack-sub">SKU {p.sku} · minimum {p.minStock}</span>
                  </span>
                  <span className={`badge ${p.status === 'OUT_OF_STOCK' ? 'error' : 'warn'}`}>
                    {p.status === 'OUT_OF_STOCK' ? 'Out of stock' : `${p.quantity} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent stock activity */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Recent stock activity</h2>
              <p className="card-subtitle">Latest stock movements</p>
            </div>
          </div>
          <p className="help-text card-help">Every time stock goes up or down (imports, sales, adjustments) it is logged here, newest first, with before → after quantities.</p>
          {activity.recentTransactions.length === 0 ? (
            <div className="empty-state">No stock movements recorded yet.</div>
          ) : (
            <ul className="stack-list">
              {activity.recentTransactions.map(tx => {
                const tone = tx.type === 'IN' ? 'success' : tx.type === 'OUT' ? 'error' : 'info';
                return (
                  <li key={tx.id} className="stack-item" style={{ alignItems: 'flex-start' }}>
                    <span className={`tx-mark ${tone}`} aria-hidden="true">{tx.type === 'IN' ? '+' : tx.type === 'OUT' ? '−' : '•'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="stack-title">
                        {TX_LABEL[tx.type] || tx.type}: {Math.abs(tx.quantity).toLocaleString('en-IN')} units
                      </span>
                      <span className="stack-sub">{tx.product?.name || 'Deleted product'} · {tx.previousQty} → {tx.newQty}</span>
                      <span className="stack-sub">
                        {fmtDateTime(tx.createdAt)}
                        {tx.reason ? ` · ${REASON_LABEL[tx.reason] || tx.reason}` : ''}
                        {tx.notes ? ` · ${tx.notes.replace(/^Added stock from file:\s*/i, '')}` : ''}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
