"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Order = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  orderDate: string;
  totalAmount: number;
  customer?: { name: string; company?: string };
  _count: { items: number };
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', status: '' });
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    revenue: 0,
    purchaseValue: 0
  });

  useEffect(() => {
    loadOrders();
  }, [filter]);

  async function loadOrders() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.type) params.append('type', filter.type);
      if (filter.status) params.append('status', filter.status);
      const url = `/api/orders?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      setOrders(data);

      // Calculate stats client-side for now
      const stats = data.reduce((acc: any, order: Order) => {
        acc.total++;
        if (order.status === 'PENDING') acc.pending++;
        if (order.type === 'SALE' && ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
          acc.revenue += order.totalAmount;
        }
        if (order.type === 'PURCHASE' && ['CONFIRMED', 'DELIVERED', 'RECEIVED'].includes(order.status)) {
          acc.purchaseValue += order.totalAmount;
        }
        return acc;
      }, { total: 0, pending: 0, revenue: 0, purchaseValue: 0 });
      setStats(stats);

    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { className: string; label: string }> = {
      PENDING: { className: 'badge warning', label: 'Pending' },
      CONFIRMED: { className: 'badge info', label: 'Confirmed' },
      SHIPPED: { className: 'badge info', label: 'Shipped' },
      DELIVERED: { className: 'badge success', label: 'Delivered' },
      CANCELLED: { className: 'badge error', label: 'Cancelled' },
      RECEIVED: { className: 'badge success', label: 'Received' }
    };
    const badge = badges[status] || { className: 'badge', label: status };
    return <span className={badge.className}>{badge.label}</span>;
  }

  return (
    <div className="container fade-in">
      {/* Header Section */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 32, alignItems: 'center' }}>
        <div>
          <h1 className="page-title">
            Order Management
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>Track sales, purchases, and order fulfillments</p>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <a href="/api/export/orders" className="btn secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span></span> Export
          </a>
          <Link href="/orders/new" className="btn primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>+</span> New Order
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label">Total orders</span>
          <span className="kpi-value">{stats.total.toLocaleString('en-IN')}</span>
          <span className="kpi-foot">Sales and purchases</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot warn" aria-hidden="true" />Pending action</span>
          <span className="kpi-value">{stats.pending.toLocaleString('en-IN')}</span>
          <span className="kpi-foot">Waiting to be confirmed</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Sales revenue</span>
          <span className="kpi-value">₹{stats.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          <span className="kpi-foot">From sale orders</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Purchase value</span>
          <span className="kpi-value">₹{stats.purchaseValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          <span className="kpi-foot">From purchase orders</span>
        </div>
      </div>

      {/* Control Bar - Filters Inline */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Filter:</span>
        <select
          value={filter.type}
          onChange={(e) => setFilter({ ...filter, type: e.target.value })}
          style={{ flex: '0 0 180px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Types</option>
          <option value="SALE">Sales</option>
          <option value="PURCHASE">Purchases</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          style={{ flex: '0 0 180px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">✓ Confirmed</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: '13px' }}>{orders.length} order{orders.length !== 1 ? 's' : ''} found</span>
      </div>

      {/* Orders Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div className="muted">Loading orders...</div>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}></div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>No orders found</h3>
            <p className="muted" style={{ margin: '0 0 24px', fontSize: '14px' }}>Get started by creating your first order.</p>
            <Link href="/orders/new" className="btn primary">Create Order</Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Order #</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Customer</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Items</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'rgba(0,0,0,0.01)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, fontFamily: 'monospace' }}>
                      <Link href={`/orders/${order.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className={`badge ${order.type === 'SALE' ? 'success' : 'info'}`} style={{ opacity: 0.9, fontSize: '11px', padding: '2px 8px' }}>
                        {order.type === 'SALE' ? 'OUT' : 'IN'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 500 }}>{order.customer?.company || order.customer?.name || <span className="muted">-</span>}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--foreground-secondary)' }}>
                      {new Date(order.orderDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                        {order._count.items}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                      ₹{order.totalAmount.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {getStatusBadge(order.status)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {order.type === 'SALE' && ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status) && (
                        <button
                          onClick={async () => {
                            if (!confirm('Generate Invoice for this order?')) return;
                            try {
                              const res = await fetch('/api/invoices/generate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: order.id })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert('Invoice Generated!');
                                router.push('/invoices');
                              } else {
                                alert('Error: ' + data.error);
                              }
                            } catch (e) {
                              alert('Failed to generate invoice');
                            }
                          }}
                          className="btn"
                          style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                          title="Generate Invoice"
                        >
                          
                        </button>
                      )}
                      <Link href={`/orders/${order.id}`} className="btn secondary" style={{ fontSize: '12px', padding: '4px 10px' }}>
                        View
                      </Link>
                      {order.type === 'PURCHASE' && ['CONFIRMED', 'SHIPPED'].includes(order.status) && (
                        <button
                          onClick={async () => {
                            // Quick auto-receive for now
                            if (!confirm('Create GRN for this PO (Receive All)?')) return;
                            try {
                              // Fetch items first to auto-fill
                              // ... Assuming backend handles empty items list by receiving all? 
                              // Actually for simplicity let's just create a shell GRN or assume 'receive all' logic in backend if items empty, 
                              // but better to just show a prompt or redirect.
                              // Let's redirect to a new GRN creation page? Or just simple create.
                              // For this MVP, I'll assume we can just create the GRN with the orderID and "Received All" note.
                              // I need to fetch items to pass them if strict, but let's try just passing orderId and handling on server if desired,
                              // or fetching order details client side.
                              // SIMPLIFICATION: fetches order details then posts.
                              const orderRes = await fetch(`/api/orders/${order.id}`);
                              const orderData = await orderRes.json();

                              const res = await fetch('/api/grn', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  orderId: order.id,
                                  note: 'Auto-received via One-Click',
                                  items: orderData.items.map((i: any) => ({
                                    productId: i.productId,
                                    quantityReceived: i.quantity
                                  }))
                                })
                              });

                              if (res.ok) {
                                alert('GRN Created and Order marked Received');
                                router.push('/grn');
                              } else {
                                alert('Failed to create GRN');
                              }
                            } catch (e) {
                              alert('Error creating GRN');
                            }
                          }}
                          className="btn"
                          style={{ fontSize: '12px', padding: '4px 10px', background: '#dcfce7', color: '#166534', border: '1px solid #bbb' }}
                          title="Receive Goods"
                        >
                          Recv
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div >
  );
}
