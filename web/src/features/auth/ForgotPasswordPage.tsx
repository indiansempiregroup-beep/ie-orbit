import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import { getPostLoginPath } from '../../utils/roles';

export function ForgotPasswordPage() {
  usePageMeta({ title: 'Forgot password — AppointIE' });
  const auth = useAuthContext();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (auth.token && auth.user) {
    return <Navigate to={getPostLoginPath(auth.user)} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const client = createAuthenticatedClient();
      await client.auth.forgotPassword({ email });
      setSubmitted(true);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "We couldn't send a reset link right now. Please check the email and try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Forgot password</h1>
      <p className="auth-lead">Enter your email and we will send reset instructions if an account exists.</p>
      {submitted ? (
        <p role="status">If an account exists for {email}, you will receive a reset link shortly.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input label="Email address" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {error ? <div role="alert" className="auth-error">{error}</div> : null}
          <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/auth">Back to sign in</Link>
      </p>
    </>
  );
}
