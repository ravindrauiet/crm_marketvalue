"use client";
import { useState, useEffect } from 'react';

type Analytics = {
  sales: {
    totalRevenue: number;
    totalOrders: number;
    totalItems: number;
    averageOrderValue: number;
    topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  };
  stock: {
    totalValue: number;
    totalProducts: number;
    lowStockCount: number;
    lowStockProducts: Array<{ id: string; sku: string; name: string; quantity: number; minStock: number }>;
  };
  activity: {
    recentOrders: any[];
    recentTransactions: any[];
  };
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container fade-in">
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div className="muted">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="container fade-in">
      <h2 style={{ marginTop: 0, marginBottom: 24 }}>Analytics & Reports</h2>

      {/* Sales Overview */}
      <div className="row" style={{ gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Revenue</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)' }}>
            ₹{analytics.sales.totalRevenue.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Orders</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{analytics.sales.totalOrders}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Order Value</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            ₹{analytics.sales.averageOrderValue.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock Value</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            ₹{analytics.stock.totalValue.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        {/* Top Products */}
        <div className="card" style={{ flex: 1, minWidth: 400 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Top Selling Products</h3>
          {analytics.sales.topProducts.length === 0 ? (
            <div className="muted">No sales data available</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {analytics.sales.topProducts.map((product, idx) => (
                  <tr key={idx}>
                    <td>{product.name}</td>
                    <td style={{ textAlign: 'right' }}>{product.quantity}</td>
                    <td style={{ textAlign: 'right' }}><strong>₹{product.revenue.toLocaleString()}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Low Stock Alert */}
        <div className="card" style={{ flex: 1, minWidth: 400 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            Low Stock Alert
            {analytics.stock.lowStockCount > 0 && (
              <span className="badge error" style={{ marginLeft: 12 }}>
                {analytics.stock.lowStockCount}
              </span>
            )}
          </h3>
          {analytics.stock.lowStockProducts.length === 0 ? (
            <div className="muted">All products are well stocked</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Min</th>
                </tr>
              </thead>
              <tbody>
                {analytics.stock.lowStockProducts.map((product) => (
                  <tr key={product.id}>
                    <td><span className="badge">{product.sku}</span></td>
                    <td>{product.name}</td>
                    <td style={{ textAlign: 'right', color: 'var(--error)', fontWeight: 600 }}>
                      {product.quantity}
                    </td>
                    <td style={{ textAlign: 'right' }}>{product.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}





