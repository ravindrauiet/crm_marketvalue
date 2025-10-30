import type { ProductListItem } from '@/lib/products';

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
        </tr>
      </thead>
      <tbody>
        {products.map(p => (
          <tr key={p.id}>
            <td className="muted">{p.sku}</td>
            <td>{p.name}</td>
            <td>{p.brand || '-'}</td>
            <td>{p.group || '-'}</td>
            <td style={{ textAlign: 'right' }}>{p.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


