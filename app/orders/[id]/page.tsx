"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Order = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  orderDate: string;
  deliveryDate?: string;
  totalAmount: number;
  notes?: string;
  customer?: { id: string; name: string; company?: string };
  items: Array<{
    id: string;
    product: { id: string; sku: string; name: string };
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
};

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [params.id]);

  async function loadOrder() {
    try {
      const res = await fetch(`/api/orders/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      }
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        await loadOrder();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update status');
      }
    } catch (error) {
      alert('Failed to update status');
    } finally {
      setUpdating(false);
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

  if (loading) {
    return (
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Loading...</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Order not found</div>
          <Link href="/orders" className="btn" style={{ marginTop: 16 }}>Back to Orders</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Link href="/orders" className="muted" style={{ fontSize: 14 }}>← Back to Orders</Link>
          <h2 style={{ marginTop: 8, marginBottom: 0 }}>{order.orderNumber}</h2>
          <div className="muted" style={{ fontSize: 14 }}>
            {order.type} Order • {new Date(order.orderDate).toLocaleDateString()}
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          {getStatusBadge(order.status)}
        </div>
      </div>

      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 2 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Order Items</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div><strong>{item.product.name}</strong></div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <a href={`/products/${item.product.id}`} style={{ color: 'var(--primary)' }}>
                        SKU: {item.product.sku}
                      </a>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>₹{item.unitPrice.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>₹{item.totalPrice.toLocaleString()}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Total:</td>
                <td style={{ textAlign: 'right', fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                  ₹{order.totalAmount.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Order Information</h3>
          
          {order.customer && (
            <div style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Customer</div>
              <div>
                <a href={`/customers/${order.customer.id}`} style={{ color: 'var(--primary)' }}>
                  {order.customer.name}
                </a>
                {order.customer.company && (
                  <div className="muted" style={{ fontSize: 12 }}>{order.customer.company}</div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Status</div>
            <div style={{ marginBottom: 8 }}>{getStatusBadge(order.status)}</div>
            {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
              <select
                value={order.status}
                onChange={(e) => updateStatus(e.target.value)}
                disabled={updating}
                style={{ width: '100%', marginTop: 8 }}
              >
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SHIPPED">Shipped</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Order Date</div>
            <div>{new Date(order.orderDate).toLocaleString()}</div>
          </div>

          {order.deliveryDate && (
            <div style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Delivery Date</div>
              <div>{new Date(order.deliveryDate).toLocaleDateString()}</div>
            </div>
          )}

          {order.notes && (
            <div style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Notes</div>
              <div>{order.notes}</div>
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">Items:</span>
              <strong>{order.items.length}</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Total Amount:</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>
                ₹{order.totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




