"use client";
import { useState, useEffect } from 'react';

type ExtractionStatusProps = {
  fileId: string;
  status?: string | null;
};

type ProcessingSummary = {
  productsExtracted: number;
  productsMatched: number;
  productsUpdated: number;
  productsCreated: number;
  productsUnmatched: Array<{ sku: string; name: string; quantity?: number }>;
  stockUpdated: number;
  errors?: string[];
};

export default function ExtractionStatus({ fileId, status: initialStatus }: ExtractionStatusProps) {
  const [status, setStatus] = useState(initialStatus || 'PENDING');
  const [extractedProducts, setExtractedProducts] = useState<any[]>([]);
  const [processingSummary, setProcessingSummary] = useState<ProcessingSummary | null>(null);

  useEffect(() => {
    // Poll for status updates if processing
    if (status === 'PROCESSING' || status === 'PENDING') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/files/${fileId}/extraction-status`);
          if (res.ok) {
            const data = await res.json();
            setStatus(data.extractionStatus);
            if (data.extractedProducts) {
              setExtractedProducts(data.extractedProducts);
            }
            if (data.processingSummary) {
              setProcessingSummary(data.processingSummary);
            }
            if (data.extractionStatus === 'COMPLETED' || data.extractionStatus === 'FAILED') {
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error('Error fetching extraction status:', error);
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(interval);
    } else if (status === 'COMPLETED') {
      // Load extracted products and summary if completed
      fetch(`/api/files/${fileId}/extraction-status`)
        .then(res => res.json())
        .then(data => {
          if (data.extractedProducts) {
            setExtractedProducts(data.extractedProducts);
          }
          if (data.processingSummary) {
            setProcessingSummary(data.processingSummary);
          }
        })
        .catch(console.error);
    }
  }, [fileId, status]);

  function getStatusBadge() {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge success">Extracted</span>;
      case 'PROCESSING':
        return <span className="badge info">Processing...</span>;
      case 'FAILED':
        return <span className="badge warn">Failed</span>;
      case 'PENDING':
        return <span className="badge">Pending</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  }

  return (
    <div>
      {getStatusBadge()}
      {status === 'COMPLETED' && processingSummary && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <div>
            <strong>{processingSummary.productsExtracted}</strong> extracted •{' '}
            <strong style={{ color: 'var(--success)' }}>{processingSummary.productsMatched}</strong> matched
          </div>
          {processingSummary.productsCreated > 0 && (
            <div style={{ color: 'var(--info)' }}>
              {processingSummary.productsCreated} new product(s) created
            </div>
          )}
          {processingSummary.productsUpdated > 0 && (
            <div style={{ color: 'var(--success)' }}>
              {processingSummary.productsUpdated} product(s) updated
            </div>
          )}
          {processingSummary.stockUpdated > 0 && (
            <div style={{ color: 'var(--success)' }}>
              Stock updated for {processingSummary.stockUpdated} product(s)
            </div>
          )}
          {processingSummary.productsUnmatched && processingSummary.productsUnmatched.length > 0 && (
            <div style={{ color: 'var(--warning)', marginTop: 4 }}>
              {processingSummary.productsUnmatched.length} unmatched (not in database)
            </div>
          )}
          {processingSummary.errors && processingSummary.errors.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 11 }}>
              <summary style={{ color: 'var(--error)', cursor: 'pointer', fontWeight: 600 }}>
                {processingSummary.errors.length} error(s) occurred
              </summary>
              <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
                {processingSummary.errors.slice(0, 10).map((error, idx) => (
                  <div key={idx} style={{ marginBottom: 4, color: 'var(--error)', fontSize: 10 }}>
                    • {error}
                  </div>
                ))}
                {processingSummary.errors.length > 10 && (
                  <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>
                    ... and {processingSummary.errors.length - 10} more errors
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
      {status === 'COMPLETED' && !processingSummary && extractedProducts.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          {extractedProducts.length} product(s) extracted
        </div>
      )}
    </div>
  );
}



