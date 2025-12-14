"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Product = {
  id: string;
  sku: string;
  name: string;
  price?: number;
  quantity: number;
  status: string;
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
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    loadProducts(); // Load initial products
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchProduct]);

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) setCustomers(await res.json());
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  }

  async function loadProducts() {
    setSearchLoading(true);
    try {
      const url = searchProduct
        ? `/api/products?q=${encodeURIComponent(searchProduct)}`
        : `/api/products`; // Load default list if empty
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.slice(0, 50));
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setSearchLoading(false);
    }
  }

  function getProductStock(product: Product) {
    return product.quantity || 0;
  }

  function addProduct(product: Product) {
    const currentStock = getProductStock(product);

    // Check if product is out of stock for SALES
    if (orderType === 'SALE' && currentStock <= 0) {
      alert(`Cannot add "${product.name}" - Out of Stock!`);
      return;
    }

    const existing = items.find(item => item.productId === product.id);

    // Check stock limit for existing items
    if (existing && orderType === 'SALE') {
      if (existing.quantity + 1 > currentStock) {
        alert(`Cannot add more "${product.name}". Max stock is ${currentStock}.`);
        return;
      }
    }

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
        // Validation for Quantity change
        if (field === 'quantity') {
          const stock = getProductStock(item.product);
          if (orderType === 'SALE' && value > stock) {
            alert(`Quantity cannot exceed current stock (${stock})`);
            return item; // Do not update
          }
        }

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
      <div className="row" style={{ alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <button onClick={() => router.back()} className="btn secondary" style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Create New Order</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 350px', gap: 24 }}>
          {/* Left Column: Form & Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* 1. Order Details Card */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '18px', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                1. Order Details
              </h3>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontWeight: 500, display: 'block', marginBottom: 8 }}>Order Type *</label>
                  <select
                    value={orderType}
                    onChange={(e) => {
                      setOrderType(e.target.value as 'PURCHASE' | 'SALE');
                      setItems([]); // Clear items when switching type to prevent invalid stock states
                    }}
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                  >
                    <option value="SALE">💰 Sales Order (Out)</option>
                    <option value="PURCHASE">📦 Purchase Order (In)</option>
                  </select>
                  <p className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                    {orderType === 'SALE' ? 'Deducts from inventory' : 'Adds to inventory'}
                  </p>
                </div>
                <div>
                  <label style={{ fontWeight: 500, display: 'block', marginBottom: 8 }}>Customer / Vendor</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                  >
                    <option value="">Select {orderType === 'SALE' ? 'Customer' : 'Vendor'}...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Product Selection Card */}
            <div className="card" style={{ minHeight: 400 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '18px', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                2. Add Products
              </h3>

              <div style={{ position: 'relative', marginBottom: 24 }}>
                <input
                  type="text"
                  placeholder="🔍 Search products by name or SKU..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--primary)', outline: 'none', fontSize: '16px' }}
                  autoFocus
                />

                {searchLoading && (
                  <div style={{ position: 'absolute', right: 12, top: 14 }} className="spinner"></div>
                )}

                {/* Search Results Dropdown */}
                {searchProduct && products.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    marginTop: 8,
                    border: '1px solid var(--border)', borderRadius: 8,
                    maxHeight: 300, overflowY: 'auto',
                    background: 'var(--card-bg)', zIndex: 10,
                    boxShadow: 'var(--shadow-lg)'
                  }}>
                    {products.map(product => {
                      const stock = getProductStock(product);
                      const isOutOfStock = orderType === 'SALE' && stock <= 0;
                      return (
                        <div
                          key={product.id}
                          onClick={() => !isOutOfStock && addProduct(product)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: isOutOfStock ? 'rgba(255,0,0,0.05)' : 'transparent',
                            opacity: isOutOfStock ? 0.7 : 1
                          }}
                          onMouseEnter={(e) => !isOutOfStock && (e.currentTarget.style.background = 'var(--bg-secondary)')}
                          onMouseLeave={(e) => !isOutOfStock && (e.currentTarget.style.background = isOutOfStock ? 'rgba(255,0,0,0.05)' : 'transparent')}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>{product.name}</div>
                            <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                              <span>SKU: {product.sku}</span>
                              <span style={{ color: stock <= 5 ? 'var(--error)' : 'var(--success)' }}>
                                • Stock: {stock}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 600 }}>₹{product.price?.toLocaleString() ?? 0}</div>
                            {isOutOfStock && <div style={{ fontSize: 10, color: 'var(--error)', textTransform: 'uppercase', fontWeight: 700 }}>Out of Stock</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Items Table */}
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', opacity: 0.5 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🛒</div>
                  <div>Map products here to build your order</div>
                </div>
              ) : (
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
                      <th style={{ textAlign: 'right', padding: 8, width: 100 }}>Stock</th>
                      <th style={{ textAlign: 'center', padding: 8, width: 100 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: 8, width: 120 }}>Price</th>
                      <th style={{ textAlign: 'right', padding: 8, width: 120 }}>Total</th>
                      <th style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const stock = getProductStock(item.product);
                      return (
                        <tr key={item.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: 12 }}>
                            <div style={{ fontWeight: 500 }}>{item.product.name}</div>
                            <div className="muted" style={{ fontSize: 11 }}>{item.product.sku}</div>
                          </td>
                          <td style={{ textAlign: 'right', padding: 12, color: 'var(--foreground-secondary)' }}>
                            {stock}
                          </td>
                          <td style={{ padding: 12, textAlign: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              max={orderType === 'SALE' ? stock : undefined}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.productId, 'quantity', parseInt(e.target.value) || 1)}
                              style={{ width: 60, textAlign: 'center', padding: 6, borderRadius: 4, border: '1px solid var(--border)' }}
                            />
                          </td>
                          <td style={{ padding: 12, textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(item.productId, 'unitPrice', parseFloat(e.target.value) || 0)}
                              style={{ width: 80, textAlign: 'right', padding: 6, borderRadius: 4, border: '1px solid var(--border)' }}
                            />
                          </td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                            ₹{item.totalPrice.toLocaleString()}
                          </td>
                          <td style={{ padding: 12, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId)}
                              className="btn error"
                              style={{ padding: '4px 8px', fontSize: 14 }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>Notes / Remarks</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about delivery, payment, etc."
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Right Column: Summary Sticky Panel */}
          <div>
            <div className="card" style={{ position: 'sticky', top: 24, padding: 24, border: '1px solid var(--border)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: '18px' }}>Summary</h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span className="muted">Total Items</span>
                <strong>{items.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span className="muted">Total Quantity</span>
                <strong>{items.reduce((acc, i) => acc + i.quantity, 0)}</strong>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '16px', fontWeight: 500 }}>Grand Total</span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--primary)' }}>
                    ₹{totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="btn primary"
                style={{ width: '100%', padding: '14px', fontSize: '16px', marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}
                disabled={loading || items.length === 0}
              >
                {loading ? <span className="spinner"></span> : <span>✓ Complete Order</span>}
              </button>

              {items.length === 0 && (
                <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                  Add items to proceed
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
