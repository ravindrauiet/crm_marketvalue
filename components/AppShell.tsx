"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from './Icon';

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: 'dashboard' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics' },
    ],
  },
  {
    title: 'Chain Operations',
    items: [
      { href: '/po', label: 'Purchase Orders', icon: 'po' },
      { href: '/po/reconciliation-report', label: 'Fill Rate Report', icon: 'fillRate' },
      { href: '/shortfall', label: 'Shortfall Planner', icon: 'shortfall' },
      { href: '/item-mapping', label: 'Item Mapping', icon: 'mapping' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/reconciliation', label: 'Payment Reconciliation', icon: 'reco' },
      { href: '/purchase-bills', label: 'Purchase Bills (OCR)', icon: 'bills' },
      { href: '/invoices', label: 'Invoices', icon: 'invoices' },
      { href: '/payments', label: 'Payments', icon: 'payments' },
    ],
  },
  {
    title: 'Sales & Inventory',
    items: [
      { href: '/orders', label: 'Orders', icon: 'orders' },
      { href: '/grn', label: 'Goods Received', icon: 'grn' },
      { href: '/products', label: 'Products', icon: 'products' },
      { href: '/products/import', label: 'Stock Import', icon: 'import' },
      { href: '/customers', label: 'Customers', icon: 'customers' },
      { href: '/records', label: 'Documents', icon: 'records' },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.title })));

/** The nav item whose href is the longest prefix of the current path */
function activeItem(pathname: string) {
  let best: (typeof ALL_ITEMS)[number] | undefined;
  for (const item of ALL_ITEMS) {
    const match = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(item.href + '/');
    if (match && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Login page renders without the application chrome
  if (pathname === '/login') return <>{children}</>;

  const current = activeItem(pathname);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="shell">
      <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label="Main navigation">
        <Link href="/" className="sidebar-brand">
          <img src="/image.webp" alt="" width={30} height={30} />
          <div>
            <div className="sidebar-brand-name">Glomin Overseas</div>
            <div className="sidebar-brand-sub">Distribution CRM</div>
          </div>
        </Link>

        <nav className="sidebar-nav">
          {NAV.map(group => (
            <div key={group.title} className="sidebar-group">
              <div className="sidebar-group-title">{group.title}</div>
              {group.items.map(item => {
                const isActive = current?.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={17} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-version">v1.1 · © {new Date().getFullYear()} Glomin Overseas</div>
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="topbar-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Icon name="menu" size={20} />
          </button>
          <div className="breadcrumb">
            {current && current.href !== '/' && (
              <>
                <span className="breadcrumb-group">{current.group}</span>
                <Icon name="chevronRight" size={14} />
              </>
            )}
            <span className="breadcrumb-current">{current?.label || 'Glomin CRM'}</span>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <button type="button" className="btn ghost sm" onClick={signOut} title="Sign out">
              <Icon name="logout" size={16} />
              <span className="topbar-signout-label">Sign out</span>
            </button>
            <div className="topbar-avatar" title="Glomin Overseas">GO</div>
          </div>
        </header>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
