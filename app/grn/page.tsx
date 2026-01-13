"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type GRN = {
    id: string;
    grnNumber: string;
    receivedDate: string;
    order: { orderNumber: string; customer: { name: string; company?: string } };
    note?: string;
};

export default function GRNPage() {
    const [grns, setGrns] = useState<GRN[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadGrns();
    }, []);

    async function loadGrns() {
        try {
            const res = await fetch('/api/grn');
            const data = await res.json();
            if (Array.isArray(data)) {
                setGrns(data);
            } else {
                console.error('API Error:', data);
                setGrns([]);
            }
        } catch (error) {
            console.error('Failed to load GRNs:', error);
            setGrns([]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="container fade-in">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 32, alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', background: 'linear-gradient(45deg, var(--primary), #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Goods Receipt Notes (GRN)
                    </h1>
                    <p className="muted" style={{ marginTop: 4 }}>Track inventory received from vendors</p>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>Loading...</div>
                ) : grns.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 16 }}>📦</div>
                        <h3>No GRNs found</h3>
                        <p className="muted">Create a GRN from the Orders page (Purchase Orders)</p>
                        <Link href="/orders" className="btn primary">Go to Orders</Link>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>GRN #</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Date Recv</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>PO #</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Vendor</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grns.map((grn, i) => (
                                    <tr key={grn.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'rgba(0,0,0,0.01)' }}>
                                        <td style={{ padding: '12px', fontWeight: 600 }}>{grn.grnNumber}</td>
                                        <td style={{ padding: '12px' }}>{new Date(grn.receivedDate).toLocaleDateString()}</td>
                                        <td style={{ padding: '12px', fontFamily: 'monospace' }}>{grn.order.orderNumber}</td>
                                        <td style={{ padding: '12px' }}>{grn.order.customer?.company || grn.order.customer?.name}</td>
                                        <td style={{ padding: '12px', color: 'var(--foreground-secondary)' }}>{grn.note || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
