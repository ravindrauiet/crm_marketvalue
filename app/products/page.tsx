import { listProducts } from '@/lib/products';
import ProductTable from '@/components/ProductTable';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams?.q || '';
  const products = await listProducts(q);
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <form>
          <input name="q" defaultValue={q} placeholder="Search SKU, name, brand, group" style={{ width: 320, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} />
        </form>
      </div>
      <div className="card">
        <ProductTable products={products} />
      </div>
    </div>
  );
}


