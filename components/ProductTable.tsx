import Link from 'next/link';
import type { ProductListItem } from '@/lib/products';

function getStatusBadge(status: string) {
  switch (status) {
    case 'OUT_OF_STOCK':
      return <span className="badge error" style={{ borderRadius: 20, padding: '4px 12px' }}>Out of Stock</span>;
    case 'LOW_STOCK':
      return <span className="badge warn" style={{ borderRadius: 20, padding: '4px 12px' }}>Low Stock</span>;
    case 'IN_STOCK':
      return <span className="badge success" style={{ borderRadius: 20, padding: '4px 12px' }}>In Stock</span>;
    default:
      return <span className="badge" style={{ borderRadius: 20, padding: '4px 12px' }}>{status}</span>;
  }
}

export default function ProductTable({ products }: { products: ProductListItem[] }) {
  return (
    <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--bg-secondary)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>SKU</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Name</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Brand</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Group</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Quantity</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Min Stock</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Status</th>
          <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {products.map(p => (
          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover:bg-slate-50">
            <td style={{ padding: '16px 24px' }}>
              <span style={{
                fontFamily: 'monospace',
                background: 'var(--bg-secondary)',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 13,
                border: '1px solid var(--border)'
              }}>
                {p.sku}
              </span>
            </td>
            <td style={{ padding: '16px 24px', fontWeight: 500 }}>{p.name}</td>
            <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{p.brand || '-'}</td>
            <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{p.group || '-'}</td>
            <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: p.quantity <= p.minStock ? 700 : 400 }}>
              {p.quantity}
            </td>
            <td style={{ padding: '16px 24px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.minStock}</td>
            <td style={{ padding: '16px 24px' }}>{getStatusBadge(p.status)}</td>
            <td style={{ padding: '16px 24px', textAlign: 'right' }}>
              <Link
                href={`/products/${p.id}`}
                style={{
                  display: 'inline-block',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--primary)',
                  background: 'var(--info-bg)',
                  transition: 'all 0.2s'
                }}
              >
                View
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


