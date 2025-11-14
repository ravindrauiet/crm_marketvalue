"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Customer = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  _count: { orders: number };
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCustomers();
  }, [search]);

  async function loadCustomers() {
    setLoading(true);
    try {
      const url = search ? `/api/customers?q=${encodeURIComponent(search)}` : '/api/customers';
      const res = await fetch(url);
      const data = await res.json();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Customers</h2>
        <div className="row" style={{ gap: 12 }}>
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300, minWidth: 200 }}
          />
          <Link className="btn" href="/customers/new">Add Customer</Link>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>All Customers</h3>
        </div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="muted">Loading...</div>
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="muted">No customers found. <Link href="/customers/new" style={{ color: 'var(--primary)' }}>Add your first customer</Link></div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City</th>
                <th>Orders</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(customer => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong></td>
                  <td>{customer.company || <span className="muted">-</span>}</td>
                  <td>{customer.email || <span className="muted">-</span>}</td>
                  <td>{customer.phone || <span className="muted">-</span>}</td>
                  <td>{customer.city || <span className="muted">-</span>}</td>
                  <td><span className="badge">{customer._count.orders}</span></td>
                  <td>
                    <Link className="btn secondary" href={`/customers/${customer.id}`} style={{ fontSize: '12px', padding: '6px 12px' }}>
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

