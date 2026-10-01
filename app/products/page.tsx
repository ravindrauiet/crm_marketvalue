import { listProducts } from '@/lib/products';
import ProductTable from '@/components/ProductTable';
import { getStockStatistics } from '@/lib/stockStatus';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const q = searchParams?.q || '';
  const statusFilter = searchParams?.status as 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | undefined;
  const products = await listProducts(q, statusFilter);
  const stats = await getStockStatistics();

  return (
    <div className="container fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Product Inventory</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 600 }}>
            Track stock levels, manage detailed product information, and view inventory distribution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/products/import" className="btn secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span></span> Import
          </Link>
          <Link href="/products/new" className="btn primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>+</span> Add Product
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label">Total products</span>
          <span className="kpi-value">{stats.total}</span>
          <span className="kpi-foot">In the catalogue</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot success" aria-hidden="true" />In stock</span>
          <span className="kpi-value">{stats.inStock}</span>
          <span className="kpi-foot">Above minimum level</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot warn" aria-hidden="true" />Low stock</span>
          <span className="kpi-value">{stats.lowStock}</span>
          <span className="kpi-foot">At or below minimum</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="status-dot error" aria-hidden="true" />Out of stock</span>
          <span className="kpi-value">{stats.outOfStock}</span>
          <span className="kpi-foot">Zero quantity</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
        <div style={{
          padding: 24,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Inventory List</h3>

          <div className="row" style={{ gap: 12, flex: 1, justifyContent: 'flex-end' }}>
            <form style={{ display: 'flex', gap: 12, flex: 1, maxWidth: 500 }}>
              <input
                name="q"
                defaultValue={q}
                placeholder="Search SKU, name, brand..."
                style={{ flex: 1 }}
              />
              <select
                name="status"
                defaultValue={statusFilter || ''}
                style={{ width: 140 }}
              >
                <option value="">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
              <button type="submit" className="btn secondary">Filter</button>
            </form>
            <a href="/api/export/products" className="btn secondary" style={{ whiteSpace: 'nowrap' }}>
              <span></span> Export
            </a>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <ProductTable products={products} />
        </div>
      </div>
    </div>
  );
}





