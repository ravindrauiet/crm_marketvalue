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
      <div className="container fade-in" style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
      </div>
    );
  }

  if (!analytics) return null;

  // Calculate max revenue for bar chart scaling
  const maxRevenue = Math.max(...analytics.sales.topProducts.map(p => p.revenue), 1);

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ marginBottom: 8 }}>Business Overview</h1>
        <p className="muted" style={{ fontSize: 16, maxWidth: 600 }}>
          Real-time performance metrics, sales insights, and inventory health monitoring.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, var(--primary), #2563eb)', color: 'white', border: 'none' }}>
          <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.9, marginBottom: 8 }}>Total Revenue</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>₹{analytics.sales.totalRevenue.toLocaleString()}</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>All time sales</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Total Orders</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)' }}>{analytics.sales.totalOrders}</div>
          <div style={{ fontSize: 13, color: 'var(--success)', marginTop: 4 }}>Avg. Value: ₹{Math.round(analytics.sales.averageOrderValue).toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Inventory Value</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)' }}>₹{analytics.stock.totalValue.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{analytics.stock.totalProducts} active SKUs</div>
        </div>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid', borderColor: analytics.stock.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Stock Health</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: analytics.stock.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' }}>
            {analytics.stock.lowStockCount > 0 ? 'Action Needed' : 'Healthy'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {analytics.stock.lowStockCount} items low on stock
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 32, alignItems: 'start' }}>
        {/* Left Column: Charts & Analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Top Products Chart */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>Top Performing Products</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {analytics.sales.topProducts.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontWeight: 600 }}>₹{p.revenue.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(p.revenue / maxRevenue) * 100}%`,
                      background: 'var(--primary)',
                      borderRadius: 4,
                      transition: 'width 1s ease-out'
                    }}></div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {p.quantity} units sold
                  </div>
                </div>
              ))}
              {analytics.sales.topProducts.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No sales data available yet.</div>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>Recent Activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {analytics.activity.recentTransactions.map((tx, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 24, position: 'relative' }}>
                  {/* Timeline Line */}
                  {i !== analytics.activity.recentTransactions.length - 1 && (
                    <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 2, background: 'var(--border)' }}></div>
                  )}

                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: tx.type === 'IN' ? 'var(--success-bg)' : tx.type === 'OUT' ? 'var(--error-bg)' : 'var(--info-bg)',
                    color: tx.type === 'IN' ? 'var(--success)' : tx.type === 'OUT' ? 'var(--error)' : 'var(--info)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, zIndex: 1, flexShrink: 0
                  }}>
                    {tx.type === 'IN' ? '+' : tx.type === 'OUT' ? '-' : '•'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>
                      {tx.type === 'IN' ? 'Stock Added' : tx.type === 'OUT' ? 'Stock Removed' : 'Adjustment'}
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      {Math.abs(tx.quantity)} units for <strong>{tx.product?.name || 'Unknown Product'}</strong>
                    </div>
                    {tx.reason && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, background: 'var(--bg-secondary)', padding: '2px 6px', display: 'inline-block', borderRadius: 4 }}>{tx.reason}</div>}
                  </div>
                </div>
              ))}
              {analytics.activity.recentTransactions.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No recent activity.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Alerts & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ border: 'none', background: 'var(--bg-secondary)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16 }}>Inventory Alerts</h3>
            {analytics.stock.lowStockProducts.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'white', borderRadius: 12 }}>
                <div style={{ fontSize: 24 }}>✅</div>
                <div>
                  <div style={{ fontWeight: 600 }}>All Good</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No stock alerts</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analytics.stock.lowStockProducts.map(p => (
                  <div key={p.id} style={{ padding: 16, background: 'white', borderRadius: 12, borderLeft: '4px solid var(--error)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span className="badge error" style={{ borderRadius: 12 }}>{p.quantity} left</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      SKU: {p.sku} • Min: {p.minStock}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}





