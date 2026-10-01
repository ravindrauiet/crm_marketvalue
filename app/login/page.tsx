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
    <div className="container" style={{ maxWidth: 380, paddingTop: 80, paddingBottom: 80 }}>
      <div className="card" style={{ padding: 28 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 6px 0' }}>🔒 Glomin CRM Login</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 20 }}>Enter the team password to continue.</p>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            className="input"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            style={{ padding: '10px 12px', fontSize: 14 }}
          />
          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>❌ {error}</div>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Checking...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
