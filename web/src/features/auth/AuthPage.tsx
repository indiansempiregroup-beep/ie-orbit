import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';

export function AuthPage() {
  usePageMeta({ title: 'Sign in — AppointIE' });
  const auth = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (auth.loading) {
    return <p role="status">Loading authentication status…</p>;
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
    <>
      <h1>Sign in to AppointIE</h1>
      <p className="auth-lead">Use your business credentials to access the dashboard.</p>
      <form onSubmit={handleSubmit}>
        <Input label="Email address" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input label="Password" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <label className="auth-checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember me on this device</span>
        </label>
        {error ? <div role="alert" className="auth-error">{error}</div> : null}
        <Button type="submit" variant="primary" disabled={auth.loading} style={{ width: '100%' }}>
          {auth.loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="auth-links">
        <Link to="/auth/forgot-password">Forgot password?</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/auth/register/start">Create workspace</Link>
      </p>
    </>
  );
}
