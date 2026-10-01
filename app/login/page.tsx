"use client";
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setError('Please enter the password'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed');
      const next = new URLSearchParams(window.location.search).get('next');
      // Only allow redirects within this site
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
      <div style={{ background: 'var(--primary-soft)', color: 'var(--text-secondary)', borderRight: '1px solid var(--border)', padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/image.webp" alt="" width={36} height={36} style={{ borderRadius: 8, background: '#fff', objectFit: 'contain', border: '1px solid var(--border)' }} />
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16 }}>Glomin Overseas</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Distribution CRM</div>
          </div>
        </div>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ color: 'var(--text)', fontSize: 28, lineHeight: 1.25, marginBottom: 12 }}>
            Chain orders, fill rate and payments in one place.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            Track POs from Blinkit, Zepto, Swiggy, Amazon, Flipkart and more — reconcile deliveries against Tally invoices and set off remittances.
          </p>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>© {new Date().getFullYear()} Glomin Overseas</div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', padding: 32, background: '#fff' }}>
        <form onSubmit={onSubmit} className="card" style={{ width: '100%', maxWidth: 380, padding: 28 }}>
          <h2 style={{ fontSize: 20, marginBottom: 4 }}>Sign in</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 20 }}>Enter the team password to continue.</p>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <div className="alert error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 16, padding: '9px 14px' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
