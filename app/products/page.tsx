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
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <div className="row" style={{ gap: 8 }}>
          <form style={{ display: 'flex', gap: 8 }}>
            <input name="q" defaultValue={q} placeholder="Search SKU, name, brand, group" style={{ width: 280, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} />
            <select name="status" defaultValue={statusFilter || ''} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}>
              <option value="">All Status</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
            <button type="submit" className="btn secondary">Filter</button>
          </form>
        </div>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">Total Products</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">In Stock</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8fe9c2' }}>{stats.inStock}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">Low Stock</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ffd48a' }}>{stats.lowStock}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">Out of Stock</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ffd48a' }}>{stats.outOfStock}</div>
        </div>
      </div>

      <div className="card">
        <ProductTable products={products} />
      </div>
    </div>
  );
}





