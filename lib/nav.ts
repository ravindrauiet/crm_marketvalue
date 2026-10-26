export type NavItem = { href: string; label: string; icon: string; hint: string };
export type NavGroup = { title: string; items: NavItem[] };

// `hint` is a plain-language one-liner shown as a sidebar tooltip and in the dashboard module guide
export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: 'dashboard', hint: 'Today at a glance: key numbers, pending tasks and recent orders.' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics', hint: 'Charts and trends for sales, orders and inventory over time.' },
    ],
  },
  {
    title: 'Chain Operations',
    items: [
      { href: '/po', label: 'Purchase Orders', icon: 'po', hint: 'Orders received from chains (Flipkart, Zepto, BigBasket…). Upload and track them here.' },
      { href: '/po/reconciliation-report', label: 'Fill Rate Report', icon: 'fillRate', hint: 'How much of each PO was actually billed and delivered. Upload daily Tally sale invoices here.' },
      { href: '/shortfall', label: 'Shortfall Planner', icon: 'shortfall', hint: 'Find PO items you cannot supply from current stock and create a purchase order to the company.' },
      { href: '/item-mapping', label: 'Item Mapping', icon: 'mapping', hint: 'Link each chain’s item code to your Tally item, with pieces-per-case conversion.' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/reconciliation', label: 'Payment Reconciliation', icon: 'reco', hint: 'Upload chain payment advices and ledgers; payments are matched against invoices.' },
      { href: '/purchase-bills', label: 'Purchase Bills (OCR)', icon: 'bills', hint: 'Upload supplier bills (PDF/photo); AI reads them so you can verify and post to Tally.' },
      { href: '/invoices', label: 'Invoices', icon: 'invoices', hint: 'Bills you have raised, with export to Tally.' },
      { href: '/payments', label: 'Payments', icon: 'payments', hint: 'Record and review money received and paid.' },
    ],
  },
  {
    title: 'Sales & Inventory',
    items: [
      { href: '/orders', label: 'Orders', icon: 'orders', hint: 'Sales and purchase orders created inside this system.' },
      { href: '/grn', label: 'Goods Received', icon: 'grn', hint: 'Goods Receipt Notes: stock received from vendors.' },
      { href: '/products', label: 'Products', icon: 'products', hint: 'Every product with its current stock level and status.' },
      { href: '/products/import', label: 'Stock Import', icon: 'import', hint: 'Upload the Tally closing-stock report to refresh stock levels.' },
      { href: '/customers', label: 'Customers', icon: 'customers', hint: 'Customer and chain contact details.' },
      { href: '/records', label: 'Documents', icon: 'records', hint: 'Archive of every file uploaded to the system.' },
    ],
  },
];
