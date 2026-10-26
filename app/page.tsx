import Link from 'next/link';
import Icon from '@/components/Icon';
import HelpToggle from '@/components/HelpToggle';
import { CLOSED_PO_STATUSES, formatINR, getDashboardData } from '@/lib/dashboard';
import { NAV } from '@/lib/nav';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 3600 * 1000;

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function statusTone(status: string) {
  if (['COMPLETED', 'DELIVERED', 'CLOSED', 'PO CLOSED'].includes(status)) return 'success';
  if (['CANCELLED', 'REMOVED', 'EXPIRED'].includes(status)) return 'error';
  if (status === 'PLANNED') return 'warn';
  return 'info';
}

/** "Due in 3 days" / "Overdue" flag for an open PO's delivery date, or null when not urgent */
function dueFlag(date: Date | null, status: string) {
  if (!date || CLOSED_PO_STATUSES.includes(status)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - today) / DAY_MS);
  if (days < 0) return { tone: 'error', text: 'Overdue' };
  if (days === 0) return { tone: 'warn', text: 'Due today' };
  if (days <= 7) return { tone: 'warn', text: `Due in ${days} day${days === 1 ? '' : 's'}` };
  return null;
}

// The day-to-day flow of work through the system, in order
const WORKFLOW = [
  { title: 'Load stock & mappings', text: 'Import the Tally closing-stock report, and map each chain’s item codes to your Tally items (one-time setup per item).', href: '/products/import', cta: 'Import stock' },
  { title: 'Receive chain POs', text: 'When Flipkart, Zepto, BigBasket etc. send a purchase order, upload the file. The system reads every item and quantity.', href: '/po/new', cta: 'Upload a PO' },
  { title: 'Check shortfall', text: 'See which ordered items you can’t supply from current stock, then create a purchase order to the company for the gap.', href: '/shortfall', cta: 'Open planner' },
  { title: 'Bill & track delivery', text: 'Upload the daily Tally sale-invoice report. The Fill Rate Report shows how much of each PO was actually delivered.', href: '/po/reconciliation-report', cta: 'Upload sales' },
  { title: 'Collect payment', text: 'Upload payment advices and ledgers from chains. Payments are matched to invoices so you can see what is still unpaid.', href: '/reconciliation', cta: 'Match payments' },
];

const QUICK_ACTIONS = [
  { icon: 'po', title: 'Upload a new chain PO', text: 'Got a PO from a chain? Upload the PDF/Excel and items are read automatically.', href: '/po/new' },
  { icon: 'fillRate', title: 'Upload daily sales', text: 'Add today’s Tally sale invoices to update sales and fill rate.', href: '/po/reconciliation-report' },
  { icon: 'shortfall', title: 'Plan a stock purchase', text: 'Find PO items short in stock and raise a company PO.', href: '/shortfall' },
  { icon: 'reco', title: 'Match chain payments', text: 'Upload a remittance advice or ledger and set it off against invoices.', href: '/reconciliation' },
  { icon: 'bills', title: 'Upload supplier bills', text: 'Photo or PDF of a purchase bill; AI reads it for you to verify.', href: '/purchase-bills' },
  { icon: 'import', title: 'Refresh stock levels', text: 'Import the latest Tally closing-stock report.', href: '/products/import' },
];

const GLOSSARY = [
  ['PO (Purchase Order)', 'An order a chain sends you, listing items, quantities and the date they must be delivered by.'],
  ['Chain', 'A retail or quick-commerce customer such as Flipkart, Amazon, Zepto, Blinkit, BigBasket or DMart.'],
  ['Appointment / expiry date', 'The slot booked to deliver a PO at the chain’s warehouse, or the date after which the PO is no longer valid.'],
  ['Fill rate', 'Share of the ordered quantity that was actually billed and delivered. 100% means the PO was fully supplied.'],
  ['Shortfall', 'Quantity ordered by chains that your current stock cannot cover.'],
  ['Item mapping', 'The link between a chain’s item code and your own Tally item name, including pieces per case.'],
  ['Tally', 'Your accounting software. Sale invoices and closing stock are exported from Tally and uploaded here.'],
  ['Reconciliation / set-off', 'Matching money received from a chain against the invoices it pays for, so you know what is still outstanding.'],
  ['Remittance advice', 'A payment statement from a chain listing which invoices a payment covers, and any deductions.'],
  ['OCR', 'Reading text from a scanned bill or photo automatically, so you don’t have to type it in.'],
  ['GRN (Goods Receipt Note)', 'A record that goods were received from a vendor, with quantities.'],
];

export default async function DashboardPage() {
  const d = await getDashboardData();
  const maxParty = Math.max(1, ...d.salesByParty.map(p => p.value));
  const stockAlerts = d.outOfStock + d.lowStock;

  const attention = [
    { show: d.billsFailed > 0, tone: 'error', icon: 'alert', text: `${d.billsFailed} purchase bill(s) failed extraction`, why: 'The AI could not read these bills. Retry, or re-upload a clearer copy.', href: '/purchase-bills', cta: 'Retry' },
    { show: d.outOfStock > 0, tone: 'error', icon: 'products', text: `${d.outOfStock} product(s) out of stock`, why: 'These cannot be supplied against new POs until restocked.', href: '/products?status=OUT_OF_STOCK', cta: 'View' },
    { show: d.duePos > 0, tone: 'warn', icon: 'clock', text: `${d.duePos} open PO(s) due within 7 days`, why: 'Make sure stock is ready and delivery appointments are booked before they expire.', href: '/po', cta: 'View' },
    { show: d.billsAwaitingReview > 0, tone: 'warn', icon: 'bills', text: `${d.billsAwaitingReview} purchase bill(s) awaiting review`, why: 'Check the values the AI read before they are posted to Tally.', href: '/purchase-bills', cta: 'Review' },
    { show: d.billsDuplicate > 0, tone: 'warn', icon: 'bills', text: `${d.billsDuplicate} possible duplicate bill(s)`, why: 'These look like bills uploaded before. Confirm or remove them to avoid double entry.', href: '/purchase-bills', cta: 'Check' },
    { show: d.recoUnmatched > 0, tone: 'warn', icon: 'reco', text: `${d.recoUnmatched} payment line(s) unmatched`, why: 'Payments that could not be linked to an invoice automatically. Match them by hand.', href: '/reconciliation', cta: 'Match' },
    { show: d.lowStock > 0, tone: 'warn', icon: 'products', text: `${d.lowStock} product(s) low on stock`, why: 'Running low. Consider reordering through the Shortfall Planner.', href: '/products?status=LOW_STOCK', cta: 'View' },
    { show: d.productsCount === 0, tone: 'info', icon: 'import', text: 'No stock loaded yet. Import the Tally closing stock', why: 'Stock levels, alerts and the Shortfall Planner all depend on this.', href: '/products/import', cta: 'Import' },
  ].filter(a => a.show);

  return (
    <div className="container fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Chain POs, deliveries, payments and stock at a glance. Start here every day.</p>
        </div>
        <div className="page-actions">
          <HelpToggle />
          <Link href="/po/reconciliation-report" className="btn secondary"><Icon name="fillRate" size={16} />Fill Rate Report</Link>
          <Link href="/po/new" className="btn"><Icon name="plus" size={16} />New PO</Link>
        </div>
      </div>

      {/* Getting-started guide */}
      <section className="card guide help-only" aria-labelledby="guide-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="guide-title"><Icon name="book" size={16} /> How this system works</h2>
            <p className="card-subtitle">An order moves through these five steps. Each one has its own page in the left menu.</p>
          </div>
        </div>
        <ol className="guide-steps">
          {WORKFLOW.map((s, i) => (
            <li key={s.title} className="guide-step">
              <span className="guide-step-num" aria-hidden="true">{i + 1}</span>
              <div className="guide-step-title">{s.title}</div>
              <p className="guide-step-text">{s.text}</p>
              <Link href={s.href} className="guide-step-link">{s.cta} <Icon name="arrowRight" size={13} /></Link>
            </li>
          ))}
        </ol>
      </section>

      {/* KPI row */}
      <h2 className="section-title">Key numbers</h2>
      <p className="help-text section-help">Four numbers that sum up the business right now. Click any tile to open the page behind it.</p>
      <div className="kpi-grid">
        <Link href="/po/reconciliation-report" className="kpi">
          <span className="kpi-label"><Icon name="invoices" size={15} />Sales billed · {d.salesMonthLabel}</span>
          <span className="kpi-value">{formatINR(d.salesValue, true)}</span>
          <span className="kpi-foot">{d.salesInvoices.toLocaleString('en-IN')} invoices from Tally uploads</span>
          <span className="help-text kpi-help">Total value invoiced to chains in {d.salesMonthLabel}, the latest month with Tally sale data uploaded.</span>
        </Link>
        <Link href="/po" className="kpi">
          <span className="kpi-label"><Icon name="po" size={15} />Open purchase orders</span>
          <span className="kpi-value">{d.openPoCount}</span>
          <span className="kpi-foot">{formatINR(d.openPoValue, true)} order value</span>
          <span className="help-text kpi-help">Chain orders not yet completed, delivered or cancelled: work still in hand.</span>
        </Link>
        <Link href="/reconciliation" className="kpi">
          <span className="kpi-label"><Icon name="reco" size={15} />Payments pending</span>
          <span className="kpi-value">{formatINR(d.recoPending, true)}</span>
          <span className="kpi-foot">{d.recoUnmatched} unmatched lines</span>
          <span className="help-text kpi-help">Money chains still owe, from uploaded payment advices. Unmatched lines couldn’t be linked to an invoice.</span>
        </Link>
        <Link href="/products" className="kpi">
          <span className="kpi-label">
            <Icon name="products" size={15} />Stock alerts
            {stockAlerts > 0 && <span className={`status-dot ${d.outOfStock > 0 ? 'error' : 'warn'}`} aria-hidden="true" />}
          </span>
          <span className="kpi-value">{stockAlerts}</span>
          <span className="kpi-foot">{d.outOfStock} out of stock · {d.lowStock} low · {d.productsCount} products</span>
          <span className="help-text kpi-help">Products that are out of stock or running low, based on the latest stock import.</span>
        </Link>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Needs attention */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Needs attention</h2>
              <p className="card-subtitle">Your to-do list, most urgent first</p>
            </div>
            {attention.length > 0 && <span className="badge warn">{attention.length} open</span>}
          </div>
          <p className="help-text card-help">
            Tasks waiting on someone. <strong>Red</strong> is blocking work; <strong>amber</strong> should be done soon.
            The button takes you straight to the page where you fix it.
          </p>
          {attention.length === 0 ? (
            <div className="empty-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="check" size={16} style={{ color: 'var(--success)' }} /> All clear. Nothing needs action right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attention.map(a => (
                <div key={a.text} className={`alert ${a.tone}`} style={{ alignItems: 'center' }}>
                  <Icon name={a.icon} size={16} />
                  <span style={{ flex: 1 }}>
                    {a.text}
                    <span className="help-text alert-why">{a.why}</span>
                  </span>
                  <Link href={a.href} className="btn secondary sm">{a.cta}</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sales by chain */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Sales by chain</h2>
              <p className="card-subtitle">Billed value, {d.salesMonthLabel}</p>
            </div>
            <Link href="/po/reconciliation-report" className="btn ghost sm">Details <Icon name="arrowRight" size={14} /></Link>
          </div>
          <p className="help-text card-help">
            Which chains you billed the most this month. A longer bar means more sales; the % is that chain’s share of the month’s total.
          </p>
          {d.salesByParty.length === 0 ? (
            <div className="empty-state">No sale invoices uploaded yet. Upload the daily Tally sale report from the Fill Rate page.</div>
          ) : (
            <div className="bar-list" role="list">
              {d.salesByParty.map(p => (
                <div key={p.label} className="bar-row" role="listitem" title={`${p.label}: ${formatINR(p.value)}`}>
                  <span className="bar-label">{p.label}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.value / maxParty) * 100}%` }} /></div>
                  <span className="bar-value">
                    {formatINR(p.value, true)}
                    <span className="bar-share">{d.salesValue > 0 ? `${Math.round((p.value / d.salesValue) * 100)}%` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">What would you like to do?</h2>
            <p className="card-subtitle">Shortcuts to the most common tasks</p>
          </div>
        </div>
        <div className="action-grid">
          {QUICK_ACTIONS.map(a => (
            <Link key={a.title} href={a.href} className="action-card">
              <span className="action-icon"><Icon name={a.icon} size={18} /></span>
              <span>
                <span className="action-title">{a.title}</span>
                <span className="action-text">{a.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent POs */}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="card-header" style={{ padding: '16px 20px 0' }}>
          <div>
            <h2 className="card-title">Recent purchase orders</h2>
            <p className="card-subtitle">Latest chain POs received</p>
          </div>
          <Link href="/po" className="btn ghost sm">All POs <Icon name="arrowRight" size={14} /></Link>
        </div>
        <p className="help-text card-help" style={{ padding: '0 20px' }}>
          The 8 newest orders from chains. <strong>Appointment / expiry</strong> is the date you must deliver by;
          rows flagged <strong>Due</strong> or <strong>Overdue</strong> need action. <strong>Value</strong> is the PO’s total order amount.
        </p>
        {d.recentPos.length === 0 ? (
          <div className="empty-state">No purchase orders yet. <Link href="/po/new" style={{ color: 'var(--primary)' }}>Upload your first PO</Link>.</div>
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
                {d.recentPos.map(po => {
                  const due = po.appointmentDate || po.deliveryDate;
                  const flag = dueFlag(due, po.status);
                  return (
                    <tr key={po.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{po.poNumber}</td>
                      <td>{po.chainName}</td>
                      <td>{fmtDate(po.poDate)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {fmtDate(due)}
                          {flag && <span className={`badge ${flag.tone}`}>{flag.text}</span>}
                        </span>
                      </td>
                      <td className="num">{formatINR(po.totalAmount)}</td>
                      <td><span className={`badge ${statusTone(po.status)}`}>{po.status.charAt(0) + po.status.slice(1).toLowerCase()}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Module guide + glossary */}
      <div className="grid-2 help-only">
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Where to find things</h2>
              <p className="card-subtitle">What each page in the left menu is for</p>
            </div>
          </div>
          <div className="module-guide">
            {NAV.filter(g => g.title !== 'Overview').map(g => (
              <div key={g.title}>
                <div className="module-group">{g.title}</div>
                <ul className="module-list">
                  {g.items.map(item => (
                    <li key={item.href}>
                      <Link href={item.href} className="module-item">
                        <Icon name={item.icon} size={16} />
                        <span>
                          <span className="module-name">{item.label}</span>
                          <span className="module-hint">{item.hint}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Glossary</h2>
              <p className="card-subtitle">Terms used across the system</p>
            </div>
          </div>
          <dl className="glossary">
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term} className="glossary-row">
                <dt>{term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
