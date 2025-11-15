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
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <form style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input 
              name="q" 
              defaultValue={q} 
              placeholder="Search SKU, name, brand, group..." 
              style={{ width: 300, minWidth: 200 }}
            />
            <select 
              name="status" 
              defaultValue={statusFilter || ''}
              style={{ minWidth: 150 }}
            >
              <option value="">All Status</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
            <button type="submit" className="btn secondary">Filter</button>
          </form>
          <a href="/api/export/products" className="btn secondary" download>Export Excel</a>
        </div>
      </div>

      <div className="row" style={{ gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Products</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>In Stock</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)' }}>{stats.inStock}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Low Stock</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--warning)' }}>{stats.lowStock}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: 20 }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Out of Stock</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--warning)' }}>{stats.outOfStock}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>Product List</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <ProductTable products={products} />
        </div>
      </div>
    </div>
  );
}





