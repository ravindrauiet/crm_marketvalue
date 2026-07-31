"use client";
import { useState } from 'react';
import Link from 'next/link';
import StockImportForm from '@/components/StockImportForm';
import StockTableWithDelete from '@/components/StockTableWithDelete';

export default function ImportProductsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>📦 Stock & Inventory Import</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Upload generic Excel files to update current closing stock quantities (PCS). Review uploaded stock below and delete/re-upload anytime.
        </p>
      </div>

      {/* Stock Import Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>📥 Bulk Stock Import</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Upload Excel file (.xlsx / .xls) containing SKU/Code, Product Name, and Closing Quantity (PCS).
        </p>
        <StockImportForm onImportSuccess={() => setRefreshKey(k => k + 1)} />
      </div>

      {/* Uploaded Stock Summary & Delete Table */}
      <StockTableWithDelete refreshKey={refreshKey} />

      {/* Shifted Section Notice */}
      <div className="card" style={{ marginTop: 32, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📦</span> Chain / Buyer PO Uploads Moved to POs Tab
            </h4>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1e3a8a' }}>
              Chain PO documents (Amazon, Blinkit, DMart, Zepto, Swiggy, BigBasket, Eastern, Reliance, Vishal) have been shifted to the POs tab for integrated PO extraction and order planning.
            </p>
          </div>
          <Link href="/po?tab=upload" className="btn" style={{ background: '#2563eb', color: '#fff', whiteSpace: 'nowrap' }}>
            Go to POs Tab →
          </Link>
        </div>
      </div>
    </div>
  );
}
