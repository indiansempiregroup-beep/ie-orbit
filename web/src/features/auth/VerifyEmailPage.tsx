import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/Button';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePageMeta } from '../../hooks/usePageMeta';

type VerifyEmailPageProps = {
  token?: string;
};

export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  usePageMeta({ title: 'Verify email — AppointIE' });
  const auth = useAuthContext();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent'>('idle');

  useEffect(() => {
    if (!token) return;
    const verificationToken = token;
    let cancelled = false;
    async function verify() {
      setStatus('loading');
      try {
        const client = createAuthenticatedClient(auth.token ?? undefined);
        const response = await client.auth.verifyEmail({ token: verificationToken });
        if (!cancelled) {
          setStatus('success');
          setMessage(`Email verified for ${response.data.email}.`);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(getApiErrorMessage(err, 'Verification failed.'));
        }
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, auth.token]);

  async function handleResend() {
    if (!auth.token) {
      setMessage('Sign in to resend verification email.');
      return;
    }
    setResendState('loading');
    try {
      const client = createAuthenticatedClient(auth.token);
      await client.auth.resendVerification();
      setResendState('sent');
      setMessage('Verification email sent.');
    } catch (err) {
      setResendState('idle');
      setMessage(getApiErrorMessage(err, 'Unable to resend verification email.'));
    }
  }

  return (
    <>
      <h1>Email verification</h1>
      {!token ? (
        <>
          <p className="auth-lead">Check your inbox for a verification link, or resend the email.</p>
          <Button variant="primary" onClick={handleResend} disabled={resendState === 'loading'}>
            {resendState === 'loading' ? 'Sending…' : resendState === 'sent' ? 'Email sent' : 'Resend verification'}
          </Button>
          {!auth.token ? (
            <p className="auth-links">
              <Link to="/auth">Sign in to resend</Link>
            </p>
          ) : null}
        </>
      ) : status === 'loading' ? (
        <p role="status">Verifying your email…</p>
      ) : (
        <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>
      )}
      <p className="auth-links">
        <Link to="/dashboard">Go to dashboard</Link>
      </p>
    </>
  );
}
