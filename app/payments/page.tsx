"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Payment = {
    id: string;
    paymentNumber: string;
    date: string;
    amount: number;
    type: string;
    method: string;
    reference?: string;
    customer?: { name: string; company?: string };
    invoice?: { invoiceNumber: string };
};

export default function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // New Payment Form State
    const [formData, setFormData] = useState({
        amount: '',
        method: 'BANK_TRANSFER',
        type: 'INCOMING',
        reference: '',
        notes: ''
    });

    useEffect(() => {
        loadPayments();
    }, []);

    async function loadPayments() {
        try {
            const res = await fetch('/api/payments');
            const data = await res.json();
            if (Array.isArray(data)) {
                setPayments(data);
            } else {
                console.error('API Error:', data);
                setPayments([]);
            }
        } catch (error) {
            console.error('Failed to load payments:', error);
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        try {
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setFormData({ amount: '', method: 'BANK_TRANSFER', type: 'INCOMING', reference: '', notes: '' });
                setShowModal(false);
                loadPayments();
            } else {
                alert('Failed to save payment');
            }
        } catch (err) {
            alert('Error saving payment');
        }
    }

    return (
        <div className="container fade-in">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 32, alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', background: 'linear-gradient(45deg, var(--primary), #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Payments
                    </h1>
                    <p className="muted" style={{ marginTop: 4 }}>Track cash flow and transactions</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>+</span> Record Payment
                </button>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ flex: 1, padding: 20, borderLeft: '4px solid #10b981' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Total Incoming</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                        ₹{payments.filter(p => p.type === 'INCOMING').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                    </div>
                </div>
                <div className="card" style={{ flex: 1, padding: 20, borderLeft: '4px solid #ef4444' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Total Outgoing</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                        ₹{payments.filter(p => p.type === 'OUTGOING').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>Loading...</div>
                ) : payments.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>No payments recorded</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Ref #</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Method</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Party</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Type</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((pay, i) => (
                                    <tr key={pay.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'rgba(0,0,0,0.01)' }}>
                                        <td style={{ padding: '12px' }}>{new Date(pay.date).toLocaleDateString()}</td>
                                        <td style={{ padding: '12px', fontFamily: 'monospace' }}>{pay.paymentNumber}</td>
                                        <td style={{ padding: '12px' }}>
                                            <span className="badge" style={{ background: 'var(--bg-secondary)' }}>{pay.method}</span>
                                            {pay.reference && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>({pay.reference})</span>}
                                        </td>
                                        <td style={{ padding: '12px' }}>{pay.customer?.company || pay.customer?.name || '-'}</td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <span className={`badge ${pay.type === 'INCOMING' ? 'success' : 'error'}`}>{pay.type}</span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                                            ₹{pay.amount.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Simple Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <h3>Record Payment</h3>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Type</label>
                                <select
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
                                >
                                    <option value="INCOMING">Incoming (Receipt)</option>
                                    <option value="OUTGOING">Outgoing (Payment)</option>
                                </select>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Amount</label>
                                <input
                                    type="number"
                                    required
                                    value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Method</label>
                                <select
                                    value={formData.method}
                                    onChange={e => setFormData({ ...formData, method: e.target.value })}
                                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
                                >
                                    <option value="BANK_TRANSFER">Bank Transfer</option>
                                    <option value="CASH">Cash</option>
                                    <option value="CHEQUE">Cheque</option>
                                    <option value="UPI">UPI</option>
                                </select>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Reference #</label>
                                <input
                                    type="text"
                                    value={formData.reference}
                                    onChange={e => setFormData({ ...formData, reference: e.target.value })}
                                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn secondary" style={{ flex: 1 }}>Cancel</button>
                                <button type="submit" className="btn primary" style={{ flex: 1 }}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
