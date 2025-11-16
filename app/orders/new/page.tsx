"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Product = {
  id: string;
  sku: string;
  name: string;
  price?: number;
  stocks: Array<{ quantity: number }>;
};

type Customer = {
  id: string;
  name: string;
  company?: string;
};

type OrderItem = {
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export default function NewOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [orderType, setOrderType] = useState<'PURCHASE' | 'SALE'>('SALE');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadCustomers();
    loadProducts();
  }, []);

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  }

  async function loadProducts() {
    try {
      const res = await fetch('/api/products?q=' + encodeURIComponent(searchProduct));
      if (res.ok) {
        const data = await res.json();
        setProducts(data.slice(0, 50)); // Limit to 50 for performance
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchProduct) loadProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchProduct]);

  function addProduct(product: Product) {
    const existing = items.find(item => item.productId === product.id);
    if (existing) {
      setItems(items.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      const price = product.price || 0;
      setItems([...items, {
        productId: product.id,
        product,
        quantity: 1,
        unitPrice: price,
        totalPrice: price
      }]);
    }
    setSearchProduct('');
  }

  function updateItem(productId: string, field: 'quantity' | 'unitPrice', value: number) {
    setItems(items.map(item => {
      if (item.productId === productId) {
        const updated = { ...item, [field]: value };
        updated.totalPrice = updated.quantity * updated.unitPrice;
        return updated;
      }
      return item;
    }));
  }

  function removeItem(productId: string) {
    setItems(items.filter(item => item.productId !== productId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      alert('Please add at least one product');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: orderType,
          customerId: customerId || undefined,
          items: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice
          })),
          notes
        })
      });

      if (res.ok) {
        const order = await res.json();
        router.push(`/orders/${order.id}`);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create order');
      }
    } catch (error) {
      alert('Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div className="container fade-in">
      <h2 style={{ marginTop: 0, marginBottom: 24 }}>Create New Order</h2>

      <form onSubmit={handleSubmit}>
        <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
          <div className="card" style={{ flex: 2 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Order Details</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label>Order Type *</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'PURCHASE' | 'SALE')}
                required
              >
                <option value="SALE">Sales Order</option>
                <option value="PURCHASE">Purchase Order</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select Customer (Optional)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Add Products</label>
              <input
                type="text"
                placeholder="Search products by SKU or name..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
              />
              {searchProduct && products.length > 0 && (
                <div style={{
                  marginTop: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  maxHeight: 200,
                  overflowY: 'auto',
                  background: 'var(--bg)'
                }}>
                  {products.map(product => {
                    const stock = product.stocks.find(s => s.location === 'TOTAL')?.quantity || 0;
                    return (
                      <div
                        key={product.id}
                        onClick={() => addProduct(product)}
                        style={{
                          padding: 12,
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div><strong>{product.name}</strong></div>
                          <div className="muted" style={{ fontSize: 12 }}>SKU: {product.sku} | Stock: {stock}</div>
                        </div>
                        {product.price && <div>₹{product.price.toLocaleString()}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ marginBottom: 12 }}>Order Items</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'right', width: 100 }}>Qty</th>
                      <th style={{ textAlign: 'right', width: 120 }}>Unit Price</th>
                      <th style={{ textAlign: 'right', width: 120 }}>Total</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.productId}>
                        <td>
                          <div><strong>{item.product.name}</strong></div>
                          <div className="muted" style={{ fontSize: 12 }}>{item.product.sku}</div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.productId, 'quantity', parseInt(e.target.value) || 1)}
                            style={{ width: 80, textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.productId, 'unitPrice', parseFloat(e.target.value) || 0)}
                            style={{ width: 100, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <strong>₹{item.totalPrice.toLocaleString()}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId)}
                            className="btn secondary"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label>Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="card" style={{ flex: 1, minWidth: 300, position: 'sticky', top: 100 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Order Summary</h3>
            <div style={{ marginBottom: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">Items:</span>
                <strong>{items.length}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">Total Quantity:</span>
                <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>Total Amount:</span>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                    ₹{totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexDirection: 'column' }}>
              <button type="submit" className="btn" disabled={loading || items.length === 0} style={{ width: '100%' }}>
                {loading ? 'Creating...' : 'Create Order'}
              </button>
              <button type="button" className="btn secondary" onClick={() => router.back()} style={{ width: '100%' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}




