import type { ProductListItem } from '@/lib/products';

function getStatusBadge(status: string) {
  switch (status) {
    case 'OUT_OF_STOCK':
      return <span className="badge error">Out of Stock</span>;
    case 'LOW_STOCK':
      return <span className="badge warn">Low Stock</span>;
    case 'IN_STOCK':
      return <span className="badge success">In Stock</span>;
    default:
      return <span className="badge">{status}</span>;
  }
}

export default function ProductTable({ products }: { products: ProductListItem[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Name</th>
          <th>Brand</th>
          <th>Group</th>
          <th style={{ textAlign: 'right' }}>Quantity</th>
          <th style={{ textAlign: 'right' }}>Min Stock</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {products.map(p => (
          <tr key={p.id}>
            <td><span className="badge">{p.sku}</span></td>
            <td>{p.name}</td>
            <td>{p.brand || <span className="muted">-</span>}</td>
            <td>{p.group || <span className="muted">-</span>}</td>
            <td style={{ textAlign: 'right', fontWeight: p.quantity <= p.minStock ? 600 : 400 }}>
              {p.quantity}
            </td>
            <td style={{ textAlign: 'right' }}>{p.minStock}</td>
            <td>{getStatusBadge(p.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


