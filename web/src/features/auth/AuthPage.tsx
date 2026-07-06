import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';

export function AuthPage() {
  const auth = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (auth.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 32, minWidth: 360, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
          <p>Loading authentication status…</p>
        </div>
      </div>
    );
  }

  if (auth.token && auth.user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await auth.login(email, password, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in at this time.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb', padding: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}
      >
        <h2 style={{ marginTop: 0 }}>Sign in to AppointIE</h2>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>Use your business credentials to access the dashboard.</p>

        <label style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          Email address
          <input
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
            style={{ width: '100%', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 14px' }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          Password
          <input
            type="password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
            style={{ width: '100%', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 14px' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span style={{ color: '#374151' }}>Remember me on this device</span>
        </label>

        {error ? <div style={{ color: '#dc2626', marginBottom: 16 }}>{error}</div> : null}

        <button
          type="submit"
          disabled={auth.loading}
          style={{ width: '100%', border: 'none', borderRadius: 12, padding: '12px 16px', background: '#4338ca', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
        >
          {auth.loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
