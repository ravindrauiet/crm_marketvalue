"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        sku: '',
        name: '',
        brand: '',
        group: '',
        description: '',
        price: '',
        cost: '',
        initialStock: '',
        minStockThreshold: '10'
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                router.push('/products');
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to create product');
            }
        } catch (error) {
            alert('Failed to create product');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="container fade-in">
            <div className="row" style={{ alignItems: 'center', marginBottom: 24, gap: 16 }}>
                <button onClick={() => router.back()} className="btn secondary" style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ←
                </button>
                <h1 style={{ margin: 0, fontSize: '24px' }}>Add New Product</h1>
            </div>

            <div className="card" style={{ maxWidth: 800 }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Basic Info */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '16px', color: 'var(--primary)' }}>Basic Information</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>SKU *</label>
                                <input
                                    required
                                    placeholder="e.g. PROD-001"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ flex: '2 1 300px', minWidth: 250 }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Product Name *</label>
                                <input
                                    required
                                    placeholder="e.g. Premium Widget"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '16px', color: 'var(--primary)' }}>Category</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Brand</label>
                                <input
                                    placeholder="e.g. Acme Corp"
                                    value={formData.brand}
                                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Group / Category</label>
                                <input
                                    placeholder="e.g. Electronics"
                                    value={formData.group}
                                    onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Description</label>
                        <textarea
                            rows={3}
                            placeholder="Optional product description..."
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical' }}
                        />
                    </div>

                    {/* Pricing */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '16px', color: 'var(--primary)' }}>Pricing</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Selling Price (₹)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Cost Price (₹)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={formData.cost}
                                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Inventory */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '16px', color: 'var(--primary)' }}>Inventory</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Initial Stock</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={formData.initialStock}
                                    onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Low Stock Alert Threshold</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="10"
                                    value={formData.minStockThreshold}
                                    onChange={(e) => setFormData({ ...formData, minStockThreshold: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                        <button type="button" className="btn secondary" onClick={() => router.back()}>
                            Cancel
                        </button>
                        <button type="submit" className="btn primary" disabled={loading}>
                            {loading ? 'Creating...' : '+ Add Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
