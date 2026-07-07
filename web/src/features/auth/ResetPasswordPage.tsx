import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PasswordStrengthIndicator } from './components/PasswordStrengthIndicator';
import { usePageMeta } from '../../hooks/usePageMeta';

export function ResetPasswordPage() {
  usePageMeta({ title: 'Reset password — AppointIE' });
  const auth = useAuthContext();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (auth.token && auth.user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Reset token is missing.');
      return;
    }
    setLoading(true);
    try {
      const client = createAuthenticatedClient();
      await client.auth.resetPassword({ token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to reset password.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Reset password</h1>
      <p className="auth-lead">Choose a new password for your account.</p>
      {done ? (
        <p role="status">
          Password updated. <Link to="/auth">Sign in</Link>
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input label="New password" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <PasswordStrengthIndicator password={password} />
          <Input label="Confirm password" type="password" value={confirmPassword} required onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          {error ? <div role="alert" className="auth-error">{error}</div> : null}
          <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}
    </>
  );
}
