import { getRecord } from '@/lib/records';
import FilePreview from '@/components/FilePreview';
import ExtractionStatus from '@/components/ExtractionStatus';
import Link from 'next/link';

export default async function RecordDetail({ params }: { params: { id: string } }) {
  const record = await getRecord(params.id);
  if (!record) return <div className="container">Not found</div>;

  return (
    <div className="container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/records" className="btn secondary" style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ←
        </Link>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>{record.name}</h2>
          <div className="muted" style={{ fontSize: 14 }}>
            Created {new Date(record.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Files */}
      {record.files.map(f => {
        // Parse the stored JSON data
        let rawDocInfo: any = null;
        let extractedProducts: any[] = [];

        try {
          if (f.rawDocumentInfo) {
            rawDocInfo = JSON.parse(f.rawDocumentInfo);
          }
        } catch (e) { }

        try {
          if (f.extractedData) {
            const parsed = JSON.parse(f.extractedData);
            extractedProducts = parsed.products || [];
          }
        } catch (e) { }

        return (
          <div key={f.id} className="card" style={{ marginBottom: 24 }}>
            {/* File Header */}
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{f.filename}</h4>
              <ExtractionStatus fileId={f.id} status={f.extractionStatus} />
            </div>

            {/* File Preview */}
            <FilePreview fileId={f.id} mimetype={f.mimetype} />

            {/* Extraction Error */}
            {f.extractionError && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: 'var(--error-bg)',
                borderRadius: 8,
                border: '1px solid rgba(248, 81, 73, 0.3)',
                color: 'var(--error)',
                fontSize: 13
              }}>
                <strong>Extraction Error:</strong> {f.extractionError}
              </div>
            )}

            {/* RAW DOCUMENT INFO SECTION */}
            {rawDocInfo && Object.keys(rawDocInfo).length > 0 && (
              <details style={{ marginTop: 24 }}>
                <summary style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  📄 Document Information (All Extracted Data)
                </summary>
                <div style={{
                  marginTop: 12,
                  padding: 20,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    {/* Document Details */}
                    {rawDocInfo.documentType && (
                      <div><strong>Document Type:</strong> {rawDocInfo.documentType}</div>
                    )}
                    {rawDocInfo.documentNumber && (
                      <div><strong>Document Number:</strong> {rawDocInfo.documentNumber}</div>
                    )}
                    {rawDocInfo.documentDate && (
                      <div><strong>Document Date:</strong> {rawDocInfo.documentDate}</div>
                    )}
                    {rawDocInfo.currency && (
                      <div><strong>Currency:</strong> {rawDocInfo.currency}</div>
                    )}

                    {/* Vendor Info */}
                    {rawDocInfo.vendorName && (
                      <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: 12, background: 'var(--panel)', borderRadius: 8 }}>
                        <strong style={{ color: 'var(--primary)' }}>Vendor/Supplier:</strong>
                        <div style={{ marginTop: 8 }}>
                          <div><strong>Name:</strong> {rawDocInfo.vendorName}</div>
                          {rawDocInfo.vendorAddress && <div><strong>Address:</strong> {rawDocInfo.vendorAddress}</div>}
                          {rawDocInfo.vendorContact && <div><strong>Contact:</strong> {rawDocInfo.vendorContact}</div>}
                          {rawDocInfo.vendorGST && <div><strong>GST:</strong> {rawDocInfo.vendorGST}</div>}
                        </div>
                      </div>
                    )}

                    {/* Buyer Info */}
                    {rawDocInfo.buyerName && (
                      <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--panel)', borderRadius: 8 }}>
                        <strong style={{ color: 'var(--success)' }}>Buyer/Customer:</strong>
                        <div style={{ marginTop: 8 }}>
                          <div><strong>Name:</strong> {rawDocInfo.buyerName}</div>
                          {rawDocInfo.buyerAddress && <div><strong>Address:</strong> {rawDocInfo.buyerAddress}</div>}
                          {rawDocInfo.buyerContact && <div><strong>Contact:</strong> {rawDocInfo.buyerContact}</div>}
                          {rawDocInfo.buyerGST && <div><strong>GST:</strong> {rawDocInfo.buyerGST}</div>}
                        </div>
                      </div>
                    )}

                    {/* Shipping */}
                    {rawDocInfo.shippingAddress && (
                      <div><strong>Shipping Address:</strong> {rawDocInfo.shippingAddress}</div>
                    )}

                    {/* Payment & Delivery */}
                    {rawDocInfo.paymentTerms && (
                      <div><strong>Payment Terms:</strong> {rawDocInfo.paymentTerms}</div>
                    )}
                    {rawDocInfo.deliveryDate && (
                      <div><strong>Delivery Date:</strong> {rawDocInfo.deliveryDate}</div>
                    )}

                    {/* Amounts */}
                    {(rawDocInfo.subtotal || rawDocInfo.taxAmount || rawDocInfo.totalAmount) && (
                      <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: 12, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', borderRadius: 8 }}>
                        <strong>Financial Summary:</strong>
                        <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
                          {rawDocInfo.subtotal && <div>Subtotal: ₹{rawDocInfo.subtotal.toLocaleString()}</div>}
                          {rawDocInfo.taxAmount && <div>Tax: ₹{rawDocInfo.taxAmount.toLocaleString()}</div>}
                          {rawDocInfo.totalAmount && <div style={{ fontWeight: 700 }}>Total: ₹{rawDocInfo.totalAmount.toLocaleString()}</div>}
                        </div>
                      </div>
                    )}

                    {/* Notes & Terms */}
                    {rawDocInfo.notes && (
                      <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {rawDocInfo.notes}</div>
                    )}
                    {rawDocInfo.terms && (
                      <div style={{ gridColumn: '1 / -1' }}><strong>Terms:</strong> {rawDocInfo.terms}</div>
                    )}
                    {rawDocInfo.allVisibleText && (
                      <div style={{ gridColumn: '1 / -1' }}><strong>Other Text:</strong> {rawDocInfo.allVisibleText}</div>
                    )}

                    {/* Additional Fields */}
                    {rawDocInfo.additionalFields && Object.keys(rawDocInfo.additionalFields).length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong>Additional Fields:</strong>
                        <pre style={{ fontSize: 12, background: 'var(--panel)', padding: 8, borderRadius: 4, overflow: 'auto' }}>
                          {JSON.stringify(rawDocInfo.additionalFields, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            )}

            {/* EXTRACTED PRODUCTS SECTION */}
            {extractedProducts.length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  📦 Extracted Products ({extractedProducts.length} items)
                </summary>
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th>SKU</th>
                        <th>Name</th>
                        <th>Brand</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedProducts.map((p, i) => (
                        <tr key={i}>
                          <td><code style={{ fontSize: 11 }}>{p.sku}</code></td>
                          <td>{p.name}</td>
                          <td>{p.brand || '-'}</td>
                          <td>{p.group || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{p.quantity || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{p.price ? `₹${p.price}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
