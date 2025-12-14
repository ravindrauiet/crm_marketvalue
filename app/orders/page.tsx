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
          <h1 style={{ margin: 0, fontSize: '28px', background: 'linear-gradient(45deg, var(--primary), #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Order Management
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>Track sales, purchases, and order fulfillments</p>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <a href="/api/export/orders" className="btn secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span> Export
          </a>
          <Link href="/orders/new" className="btn primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>+</span> New Order
          </Link>
        </div>
      </div>

      {/* Stats Cards - Using Flexbox */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ flex: '1 1 200px', minWidth: 180, padding: 20, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: 'none', color: '#fff' }}>
          <div style={{ fontSize: '11px', marginBottom: 6, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Orders</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{stats.total.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: '1 1 200px', minWidth: 180, padding: 20, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: 'none', color: '#fff' }}>
          <div style={{ fontSize: '11px', marginBottom: 6, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Action</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{stats.pending}</div>
        </div>
        <div className="card" style={{ flex: '1 1 200px', minWidth: 180, padding: 20, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#fff' }}>
          <div style={{ fontSize: '11px', marginBottom: 6, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>₹{stats.revenue.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: '1 1 200px', minWidth: 180, padding: 20, background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: 'none', color: '#fff' }}>
          <div style={{ fontSize: '11px', marginBottom: 6, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Purchase Value</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>₹{stats.purchaseValue.toLocaleString()}</div>
        </div>
      </div>

      {/* Control Bar - Filters Inline */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Filter:</span>
        <select
          value={filter.type}
          onChange={(e) => setFilter({ ...filter, type: e.target.value })}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', minWidth: 140, fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Types</option>
          <option value="SALE">💰 Sales</option>
          <option value="PURCHASE">📦 Purchases</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', minWidth: 140, fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">⏳ Pending</option>
          <option value="CONFIRMED">✓ Confirmed</option>
          <option value="SHIPPED">🚚 Shipped</option>
          <option value="DELIVERED">✅ Delivered</option>
          <option value="CANCELLED">❌ Cancelled</option>
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
            <div style={{ fontSize: 32, marginBottom: 16 }}>📦</div>
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
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Link href={`/orders/${order.id}`} className="btn secondary" style={{ fontSize: '12px', padding: '4px 10px' }}>
                        View
                      </Link>
                    </td>
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
