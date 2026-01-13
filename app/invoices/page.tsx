"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Invoice = {
    id: string;
    invoiceNumber: string;
    date: string;
    totalAmount: number;
    status: string;
    customer: { name: string; company?: string };
    isExportedToTally: boolean;
};

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadInvoices();
    }, []);

    async function loadInvoices() {
        try {
            const res = await fetch('/api/invoices');
            const data = await res.json();
            if (Array.isArray(data)) {
                setInvoices(data);
            } else {
                console.error('API Error:', data);
                setInvoices([]);
            }
        } catch (error) {
            console.error('Failed to load invoices:', error);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="container fade-in">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 32, alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', background: 'linear-gradient(45deg, var(--primary), #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Invoices
                    </h1>
                    <p className="muted" style={{ marginTop: 4 }}>Manage bills and export to Tally</p>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>Loading...</div>
                ) : invoices.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>No invoices found</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Invoice #</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Customer</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Tally</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv, i) => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'rgba(0,0,0,0.01)' }}>
                                        <td style={{ padding: '12px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                                        <td style={{ padding: '12px' }}>{new Date(inv.date).toLocaleDateString()}</td>
                                        <td style={{ padding: '12px' }}>{inv.customer.company || inv.customer.name}</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>₹{inv.totalAmount.toLocaleString()}</td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <span className={`badge ${inv.status === 'PAID' ? 'success' : 'warning'}`}>{inv.status}</span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {inv.isExportedToTally ? (
                                                <span style={{ color: 'var(--success)', fontSize: '18px' }}>✓</span>
                                            ) : (
                                                <span style={{ color: 'var(--muted)', fontSize: '18px' }}>-</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            <a
                                                href={`/api/invoices/${inv.id}/tally`}
                                                className="btn primary"
                                                style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                onClick={() => setTimeout(loadInvoices, 1000)} // Refresh status after download
                                            >
                                                <span style={{ fontSize: '14px' }}>⬇</span> XML
                                            </a>
                                        </td>
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
