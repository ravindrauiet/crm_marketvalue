import { listProducts } from '@/lib/products';
import ProductTable from '@/components/ProductTable';
import { getStockStatistics } from '@/lib/stockStatus';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const q = searchParams?.q || '';
  const statusFilter = searchParams?.status as 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | undefined;
  const products = await listProducts(q, statusFilter);
  const stats = await getStockStatistics();

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ marginBottom: 8 }}>Product Inventory</h1>
        <p className="muted" style={{ fontSize: 16, maxWidth: 600 }}>
          Track stock levels, manage detailed product information, and view inventory distribution.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--primary)' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Total Products</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)' }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--success)' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>In Stock</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--success)' }}>{stats.inStock}</div>
        </div>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--warning)' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Low Stock</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--warning)' }}>{stats.lowStock}</div>
        </div>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--error)' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Out of Stock</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--error)' }}>{stats.outOfStock}</div>
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
              <span>📥</span> Export
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





