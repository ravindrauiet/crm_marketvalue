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
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Loading...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Product not found</div>
          <Link href="/products" className="btn" style={{ marginTop: 16 }}>Back to Products</Link>
        </div>
      </div>
    );
  }

  const stock = product.stocks.find(s => s.location === 'TOTAL');
  const currentQty = stock?.quantity || 0;

  return (
    <div className="container fade-in">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Link href="/products" className="muted" style={{ fontSize: 14 }}>← Back to Products</Link>
          <h2 style={{ marginTop: 8, marginBottom: 0 }}>{product.name}</h2>
          <div className="muted" style={{ fontSize: 14 }}>SKU: {product.sku}</div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          {!editing && (
            <>
              <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>
              <button className="btn secondary" onClick={() => setAdjustingStock(!adjustingStock)}>
                Adjust Stock
              </button>
              <button className="btn secondary" onClick={handleDelete} style={{ color: 'var(--error)' }}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 2 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Product Information</h3>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label>Name *</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label>Brand</label>
                  <input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Group</label>
                  <input
                    value={formData.group}
                    onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label>Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label>Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Min Stock Threshold</label>
                  <input
                    type="number"
                    value={formData.minStockThreshold}
                    onChange={(e) => setFormData({ ...formData, minStockThreshold: e.target.value })}
                  />
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <button className="btn" onClick={handleUpdate}>Save Changes</button>
                <button className="btn secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><strong>Brand:</strong> {product.brand || <span className="muted">-</span>}</div>
              <div><strong>Group:</strong> {product.group || <span className="muted">-</span>}</div>
              {product.description && <div><strong>Description:</strong> {product.description}</div>}
              <div className="row" style={{ gap: 24, marginTop: 8 }}>
                {product.price && <div><strong>Price:</strong> ₹{product.price.toLocaleString()}</div>}
                {product.cost && <div><strong>Cost:</strong> ₹{product.cost.toLocaleString()}</div>}
                <div><strong>Min Stock:</strong> {product.minStockThreshold}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Stock Information</h3>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            {currentQty} units
          </div>
          <div className="muted" style={{ marginBottom: 16 }}>
            Min Stock: {product.minStockThreshold}
          </div>
          {adjustingStock && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <label>New Quantity *</label>
              <input
                type="number"
                value={stockAdjustment.quantity}
                onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantity: parseInt(e.target.value) || 0 })}
                style={{ marginBottom: 12 }}
              />
              <label>Reason</label>
              <select
                value={stockAdjustment.reason}
                onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                style={{ marginBottom: 12 }}
              >
                <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                <option value="RETURN">Return</option>
                <option value="DAMAGE">Damage</option>
                <option value="LOSS">Loss</option>
                <option value="CORRECTION">Correction</option>
              </select>
              <label>Notes</label>
              <textarea
                rows={2}
                value={stockAdjustment.notes}
                onChange={(e) => setStockAdjustment({ ...stockAdjustment, notes: e.target.value })}
                style={{ marginBottom: 12 }}
              />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={handleStockAdjust}>Update Stock</button>
                <button className="btn secondary" onClick={() => setAdjustingStock(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {product.stockTransactions.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Stock History</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Previous</th>
                <th>Change</th>
                <th>New Qty</th>
                <th>Reason</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {product.stockTransactions.map(tx => (
                <tr key={tx.id}>
                  <td>{new Date(tx.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${tx.type === 'IN' ? 'success' : tx.type === 'OUT' ? 'error' : ''}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td>{tx.previousQty}</td>
                  <td style={{ color: tx.quantity > 0 && tx.type === 'IN' ? 'var(--success)' : 'var(--error)' }}>
                    {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                  </td>
                  <td><strong>{tx.newQty}</strong></td>
                  <td>{tx.reason || '-'}</td>
                  <td>{tx.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}




