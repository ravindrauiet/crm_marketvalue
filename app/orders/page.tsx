"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', status: '' });

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
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { className: string; label: string }> = {
      PENDING: { className: 'badge', label: 'Pending' },
      CONFIRMED: { className: 'badge info', label: 'Confirmed' },
      SHIPPED: { className: 'badge info', label: 'Shipped' },
      DELIVERED: { className: 'badge success', label: 'Delivered' },
      CANCELLED: { className: 'badge error', label: 'Cancelled' }
    };
    const badge = badges[status] || { className: 'badge', label: status };
    return <span className={badge.className}>{badge.label}</span>;
  }

  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Orders</h2>
        <div className="row" style={{ gap: 12 }}>
          <select
            value={filter.type}
            onChange={(e) => setFilter({ ...filter, type: e.target.value })}
            style={{ minWidth: 150 }}
          >
            <option value="">All Types</option>
            <option value="PURCHASE">Purchase Orders</option>
            <option value="SALE">Sales Orders</option>
          </select>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            style={{ minWidth: 150 }}
          >
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="SHIPPED">Shipped</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <a href="/api/export/orders" className="btn secondary" download>Export Excel</a>
          <Link className="btn" href="/orders/new">New Order</Link>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>All Orders</h3>
        </div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="muted">Loading...</div>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="muted">No orders found. <Link href="/orders/new" style={{ color: 'var(--primary)' }}>Create your first order</Link></div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td><strong>{order.orderNumber}</strong></td>
                  <td>
                    <span className="badge" style={{ 
                      background: order.type === 'PURCHASE' ? 'var(--info-bg)' : 'var(--success-bg)',
                      color: order.type === 'PURCHASE' ? 'var(--info)' : 'var(--success)'
                    }}>
                      {order.type}
                    </span>
                  </td>
                  <td>{order.customer?.name || order.customer?.company || <span className="muted">-</span>}</td>
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td><span className="badge">{order._count.items}</span></td>
                  <td><strong>₹{order.totalAmount.toLocaleString()}</strong></td>
                  <td>{getStatusBadge(order.status)}</td>
                  <td>
                    <Link className="btn secondary" href={`/orders/${order.id}`} style={{ fontSize: '12px', padding: '6px 12px' }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

