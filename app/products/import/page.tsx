import StockImportForm from '@/components/StockImportForm';

export default function ImportProductsPage() {
  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Import Products & Stock</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Upload an Excel file to import or update products and stock quantities
        </p>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>Upload Excel File</h3>
        <StockImportForm />
      </div>
    </div>
  );
}






