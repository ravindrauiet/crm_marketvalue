"use client";
import { useState, useEffect } from 'react';

type ExtractionStatusProps = {
  fileId: string;
  status?: string | null;
};

export default function ExtractionStatus({ fileId, status: initialStatus }: ExtractionStatusProps) {
  const [status, setStatus] = useState(initialStatus || 'PENDING');
  const [extractedProducts, setExtractedProducts] = useState<any[]>([]);

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
      // Load extracted products if completed
      fetch(`/api/files/${fileId}/extraction-status`)
        .then(res => res.json())
        .then(data => {
          if (data.extractedProducts) {
            setExtractedProducts(data.extractedProducts);
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
      {status === 'COMPLETED' && extractedProducts.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          {extractedProducts.length} product(s) extracted
        </div>
      )}
    </div>
  );
}


