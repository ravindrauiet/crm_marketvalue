"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  group?: string;
  description?: string;
  price?: number;
  cost?: number;
  minStockThreshold: number;
  stocks: Array<{ id: string; location: string; quantity: number; minStock: number }>;
  stockTransactions: Array<{
    id: string;
    type: string;
    quantity: number;
    previousQty: number;
    newQty: number;
    reason?: string;
    notes?: string;
    createdAt: string;
  }>;
};

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [stockAdjustment, setStockAdjustment] = useState({ quantity: 0, reason: '', notes: '' });

  useEffect(() => {
    loadProduct();
  }, [params.id]);

  async function loadProduct() {
    try {
      const res = await fetch(`/api/products/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setProduct(data);
        setFormData({
          name: data.name,
          brand: data.brand || '',
          group: data.group || '',
          description: data.description || '',
          price: data.price || '',
          cost: data.cost || '',
          minStockThreshold: data.minStockThreshold
        });
      }
    } catch (error) {
      console.error('Failed to load product:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    try {
      const res = await fetch(`/api/products/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        await loadProduct();
        setEditing(false);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update product');
      }
    } catch (error) {
      alert('Failed to update product');
    }
  }

  async function handleStockAdjust() {
    if (!product) return;
    try {
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity: stockAdjustment.quantity,
          reason: stockAdjustment.reason || 'MANUAL_ADJUSTMENT',
          notes: stockAdjustment.notes
        })
      });
      if (res.ok) {
        await loadProduct();
        setAdjustingStock(false);
        setStockAdjustment({ quantity: 0, reason: '', notes: '' });
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to adjust stock');
      }
    } catch (error) {
      alert('Failed to adjust stock');
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`/api/products/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/products');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete product');
      }
    } catch (error) {
      alert('Failed to delete product');
    }
  }

  if (loading) {
    return (
      <div className="container fade-in" style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container fade-in" style={{ padding: 64, textAlign: 'center' }}>
        <h2>Product not found</h2>
        <Link href="/products" className="btn" style={{ marginTop: 16 }}>Back to Products</Link>
      </div>
    );
  }

  const stock = product.stocks.find(s => s.location === 'TOTAL');
  const currentQty = stock?.quantity || 0;

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 24 }}>
        <Link href="/products" className="muted" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          <span>←</span> Back to Inventory
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>{product.name}</h1>
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 6, fontSize: 14, border: '1px solid var(--border)' }}>
                {product.sku}
              </span>
            </div>
            <div className="row" style={{ gap: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
              <span>{product.brand || 'No Brand'}</span>
              <span>•</span>
              <span>{product.group || 'No Group'}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            {!editing && (
              <>
                <button className="btn secondary" onClick={() => setEditing(true)}>Edit Details</button>
                <button className="btn" onClick={() => setAdjustingStock(true)}>Adjust Stock</button>
                <button className="btn secondary" onClick={handleDelete} style={{ color: 'var(--error)', borderColor: 'var(--error-bg)' }}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Details & History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>Product Details</h3>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label>Name</label>
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label>Brand</label>
                    <input value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Group</label>
                    <input value={formData.group} onChange={e => setFormData({ ...formData, group: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label>Description</label>
                  <textarea rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label>Price (₹)</label>
                    <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Cost (₹)</label>
                    <input type="number" step="0.01" value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} />
                  </div>
                </div>
                <div className="row">
                  <button className="btn" onClick={handleUpdate}>Save Changes</button>
                  <button className="btn secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <label>Description</label>
                  <p style={{ marginTop: 4, color: 'var(--text)' }}>{product.description || <span className="muted">No description provided.</span>}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="row">
                    <div style={{ flex: 1 }}>
                      <label>Price</label>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>₹{product.price?.toLocaleString() || '-'}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Cost</label>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>₹{product.cost?.toLocaleString() || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Stock Movement History</h3>
            </div>
            {product.stockTransactions.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No stock history available.</div>
            ) : (
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th style={{ textAlign: 'right' }}>Change</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {product.stockTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {new Date(tx.createdAt).toLocaleDateString()} <span style={{ opacity: 0.5 }}>{new Date(tx.createdAt).toLocaleTimeString()}</span>
                      </td>
                      <td>
                        <span className={`badge ${tx.type === 'IN' ? 'success' : tx.type === 'OUT' ? 'error' : 'info'}`} style={{ borderRadius: 12 }}>
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: tx.type === 'IN' ? 'var(--success)' : tx.type === 'OUT' ? 'var(--error)' : 'inherit' }}>
                        {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                      </td>
                      <td style={{ textAlign: 'right' }}>{tx.newQty}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {tx.reason}
                        {tx.notes && <div style={{ fontSize: 11, fontStyle: 'italic' }}>{tx.notes}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Stock Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ background: 'linear-gradient(135deg, var(--panel), var(--bg-secondary))' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Stock</h3>
            <div style={{ fontSize: 48, fontWeight: 800, color: currentQty <= product.minStockThreshold ? 'var(--warning)' : 'var(--success)', lineHeight: 1 }}>
              {currentQty}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)' }}>in total inventory</div>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>Min. Threshold</span>
                <span style={{ fontWeight: 600 }}>{product.minStockThreshold}</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min((currentQty / (product.minStockThreshold * 3)) * 100, 100)}%`,
                  background: currentQty <= product.minStockThreshold ? 'var(--warning)' : 'var(--success)'
                }}></div>
              </div>
              {currentQty <= product.minStockThreshold && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', padding: 8, borderRadius: 6 }}>
                  ⚠️ Stock is low. Reorder recommended.
                </div>
              )}
            </div>
          </div>

          {adjustingStock && (
            <div className="card fade-in" style={{ border: '2px solid var(--primary)' }}>
              <h4 style={{ marginTop: 0 }}>Adjust Stock Level</h4>
              <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Manually update quantity.</p>

              <label>Quantity Change</label>
              <input
                type="number"
                placeholder="Enter quantity"
                value={stockAdjustment.quantity}
                onChange={e => setStockAdjustment({ ...stockAdjustment, quantity: parseInt(e.target.value) || 0 })}
                style={{ marginBottom: 12 }}
              />

              <label>Reason</label>
              <select
                value={stockAdjustment.reason}
                onChange={e => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                style={{ marginBottom: 12 }}
              >
                <option value="">Select Reason...</option>
                <option value="MANUAL_ADJUSTMENT">Manual Fix</option>
                <option value="PURCHASE">New Purchase</option>
                <option value="RETURN">Customer Return</option>
                <option value="DAMAGE">Damaged/Expired</option>
              </select>

              <label>Notes</label>
              <input value={stockAdjustment.notes} onChange={e => setStockAdjustment({ ...stockAdjustment, notes: e.target.value })} style={{ marginBottom: 16 }} />

              <div className="row">
                <button className="btn" onClick={handleStockAdjust}>Update</button>
                <button className="btn secondary" onClick={() => setAdjustingStock(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





