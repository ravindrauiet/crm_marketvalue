'use client';
import Link from 'next/link';
import { useState } from 'react';

export type RecordRow = {
  id: string;
  name: string;
  createdAt: string;
  files: {
    id: string;
    filename: string;
    mimetype: string;
    extractionStatus?: string;
    rawDocumentInfo?: string | null;
    extractedData?: string | null;
  }[];
};

function getExtractionStatusBadge(status?: string) {
  if (!status) return null;
  switch (status) {
    case 'COMPLETED':
      return <span className="badge success">Extracted</span>;
    case 'PROCESSING':
      return <span className="badge info">Processing</span>;
    case 'FAILED':
      return <span className="badge error">Failed</span>;
    case 'PENDING':
      return <span className="badge">Pending</span>;
    default:
      return null;
  }
}

function DocumentInfoPreview({ rawDocumentInfo, extractedData }: { rawDocumentInfo?: string | null; extractedData?: string | null }) {
  let docInfo: any = null;
  let productCount = 0;

  try {
    if (rawDocumentInfo) {
      docInfo = JSON.parse(rawDocumentInfo);
    }
  } catch (e) { }

  try {
    if (extractedData) {
      const parsed = JSON.parse(extractedData);
      productCount = parsed.products?.length || 0;
    }
  } catch (e) { }

  if (!docInfo && productCount === 0) return null;

  return (
    <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 11 }}>
      {docInfo?.documentType && (
        <div><strong>Type:</strong> {docInfo.documentType}</div>
      )}
      {docInfo?.documentNumber && (
        <div><strong>Doc #:</strong> {docInfo.documentNumber}</div>
      )}
      {docInfo?.vendorName && (
        <div><strong>Vendor:</strong> {docInfo.vendorName}</div>
      )}
      {docInfo?.totalAmount && (
        <div><strong>Total:</strong> ₹{docInfo.totalAmount.toLocaleString()}</div>
      )}
      {productCount > 0 && (
        <div style={{ marginTop: 4 }}>
          <span className="badge info" style={{ fontSize: 10 }}>📦 {productCount} products</span>
        </div>
      )}
    </div>
  );
}

export default function RecordTable({ records }: { records: RecordRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Name</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Files & Extracted Info</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>AI Status</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Created</th>
            <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', verticalAlign: 'top' }}>
              <td style={{ padding: '16px 24px', fontWeight: 500 }}>{r.name}</td>
              <td style={{ padding: '16px 24px' }}>
                {r.files.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No files attached</span>}
                {r.files.map(f => (
                  <div key={f.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>
                        {f.mimetype.includes('pdf') ? '📄' : f.mimetype.includes('spreadsheet') || f.mimetype.includes('excel') ? '📊' : '📁'}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.filename}</span>
                      {(f.rawDocumentInfo || f.extractedData) && (
                        <button
                          onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 10,
                            color: 'var(--primary)',
                            padding: '2px 6px',
                            borderRadius: 4
                          }}
                        >
                          {expandedId === f.id ? '▲ Hide' : '▼ Show Info'}
                        </button>
                      )}
                    </div>
                    {expandedId === f.id && (
                      <DocumentInfoPreview rawDocumentInfo={f.rawDocumentInfo} extractedData={f.extractedData} />
                    )}
                  </div>
                ))}
              </td>
              <td style={{ padding: '16px 24px' }}>
                {r.files.map(f => (
                  <div key={f.id} style={{ marginBottom: 4 }}>
                    {getExtractionStatusBadge(f.extractionStatus)}
                  </div>
                ))}
              </td>
              <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: 13 }}>
                {new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
                <div style={{ fontSize: 11, opacity: 0.7 }}>{new Date(r.createdAt).toLocaleTimeString('en-GB')}</div>
              </td>
              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                <Link
                  href={`/records/${r.id}`}
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
                  View Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && (
        <div style={{ padding: 64, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No records found</h3>
          <p className="muted">Upload your first document to get started.</p>
        </div>
      )}
    </div>
  );
}
