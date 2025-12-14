"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    taxId: '',
    notes: ''
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        router.push('/customers');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create customer');
      }
    } catch (error) {
      alert('Failed to create customer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container fade-in">
      <h2 style={{ marginTop: 0, marginBottom: 24 }}>Add New Customer</h2>
      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="row" style={{ gap: 16 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Name *</label>
              <input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ width: 200 }}>
              <label>Type</label>
              <select
                value={(formData as any).type || 'CUSTOMER'}
                onChange={(e) => setFormData({ ...formData, type: e.target.value } as any)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
              >
                <option value="CUSTOMER">Customer (Generic)</option>
                <option value="VENDOR">Vendor (Supplier)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Company</label>
              <input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 16 }}>
            <div style={{ flex: 1, minWidth: 250 }}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 250 }}>
              <label>Phone</label>
              <input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label>Address</label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="row" style={{ gap: 16 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>City</label>
              <input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>State</label>
              <input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label>Zip Code</label>
              <input
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label>Country</label>
              <input
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 16 }}>
            <div style={{ flex: 1, minWidth: 250 }}>
              <label>Tax ID</label>
              <input
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label>Notes</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="row" style={{ gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn secondary" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}





