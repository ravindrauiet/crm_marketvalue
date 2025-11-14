import StockImportForm from '@/components/StockImportForm';

export default function ImportProductsPage() {
  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>Import Products & Stock</h2>
      <div className="card">
        <StockImportForm />
      </div>
    </div>
  );
}




