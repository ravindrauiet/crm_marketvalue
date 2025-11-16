"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Customer = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  taxId?: string;
  notes?: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    type: string;
    status: string;
    orderDate: string;
    totalAmount: number;
  }>;
};

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomer();
  }, [params.id]);

  async function loadCustomer() {
    try {
      const res = await fetch(`/api/customers/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
      }
    } catch (error) {
      console.error('Failed to load customer:', error);
    } finally {
      setLoading(false);
    }
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

  if (!customer) {
    return (
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Customer not found</div>
          <Link href="/customers" className="btn" style={{ marginTop: 16 }}>Back to Customers</Link>
        </div>
      </div>
    );
  }

  const totalOrders = customer.orders.length;
  const totalRevenue = customer.orders
    .filter(o => o.type === 'SALE' && o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Link href="/customers" className="muted" style={{ fontSize: 14 }}>← Back to Customers</Link>
          <h2 style={{ marginTop: 8, marginBottom: 0 }}>{customer.name}</h2>
          {customer.company && (
            <div className="muted" style={{ fontSize: 14 }}>{customer.company}</div>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 2 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Customer Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {customer.email && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Email</div>
                <div>{customer.email}</div>
              </div>
            )}
            {customer.phone && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Phone</div>
                <div>{customer.phone}</div>
              </div>
            )}
            {customer.address && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Address</div>
                <div>{customer.address}</div>
              </div>
            )}
            {customer.city && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>City</div>
                <div>{customer.city}</div>
              </div>
            )}
            {customer.state && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>State</div>
                <div>{customer.state}</div>
              </div>
            )}
            {customer.zipCode && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Zip Code</div>
                <div>{customer.zipCode}</div>
              </div>
            )}
            {customer.country && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Country</div>
                <div>{customer.country}</div>
              </div>
            )}
            {customer.taxId && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Tax ID</div>
                <div>{customer.taxId}</div>
              </div>
            )}
            {customer.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Notes</div>
                <div>{customer.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 250 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Statistics</h3>
          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Total Orders</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{totalOrders}</div>
          </div>
          {totalRevenue > 0 && (
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Total Revenue</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>
                ₹{totalRevenue.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {customer.orders.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Order History</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map(order => (
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
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${
                      order.status === 'DELIVERED' ? 'success' :
                      order.status === 'CANCELLED' ? 'error' :
                      order.status === 'SHIPPED' || order.status === 'CONFIRMED' ? 'info' : ''
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>₹{order.totalAmount.toLocaleString()}</strong>
                  </td>
                  <td>
                    <Link href={`/orders/${order.id}`} className="btn secondary" style={{ fontSize: 12, padding: '4px 8px' }}>
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
  );
}




