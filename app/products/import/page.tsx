import StockImportForm from '@/components/StockImportForm';
import UploadForm from '@/components/UploadForm';

export default function ImportProductsPage() {
  const suppliers = [
    { id: 'amazon', name: 'Amazon', color: '#FF9900' },
    { id: 'blinkit', name: 'Blinkit', color: '#F8CB46' },
    { id: 'dmart', name: 'DMart', color: '#26A541' },
    { id: 'zepto', name: 'Zepto', color: '#5B18AC' },
    { id: 'swiggy', name: 'Swiggy', color: '#FC8019' },
    { id: 'bigbasket', name: 'BigBasket', color: '#689F38' },
    { id: 'eastern', name: 'Eastern', color: '#E41E26' },
    { id: 'reliance', name: 'Reliance Retail', color: '#005CB9' },
  ];

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Import Products & Stock</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Upload supplier documents to automatically extract and update product data.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>Bulk Stock Import</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Use this for generic Excel sheets containing SKU, Name, and Quantity.
        </p>
        <StockImportForm />
      </div>

      <h3 style={{ marginBottom: 16 }}>Supplier Uploads</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 24
      }}>
        {suppliers.map(supplier => (
          <div key={supplier.id} className="card" style={{ borderLeft: `4px solid ${supplier.color}` }}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{supplier.name}</h3>
              <span className="badge" style={{ backgroundColor: supplier.color, color: '#fff' }}>
                {supplier.id.toUpperCase()}
              </span>
            </div>
            <UploadForm preselectedVendor={supplier.id} />
          </div>
        ))}
      </div>
    </div>
  );
}






