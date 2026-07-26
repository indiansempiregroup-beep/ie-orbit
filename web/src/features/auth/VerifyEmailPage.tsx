import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/Button';
import { useAuthContext } from '../../contexts/AuthContext';
import { useEmailVerification } from '../../hooks/useEmailVerification';
import { usePageMeta } from '../../hooks/usePageMeta';
import { getPostLoginPath, isPlatformAdmin } from '../../utils/roles';

type VerifyEmailPageProps = {
  token?: string;
};

export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  usePageMeta({ title: 'Verify email — AppointIE' });
  const auth = useAuthContext();
  const navigate = useNavigate();
  const { resendState, message: resendMessage, resendVerification } = useEmailVerification();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

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
          await auth.restore();
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
  }, [token, auth]);

  return (
    <>
      <h1>Email verification</h1>
      {!token ? (
        <>
          <p className="auth-lead">
            {auth.user?.email
              ? `We sent a verification link to ${auth.user.email}. Open the link in your email, or resend it below.`
              : 'Check your inbox for a verification link, or resend the email after signing in.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <Button
              variant="primary"
              type="button"
              onClick={() => void resendVerification()}
              disabled={resendState === 'loading' || resendState === 'sent'}
            >
              {resendState === 'loading' ? 'Sending…' : resendState === 'sent' ? 'Email sent' : 'Resend verification email'}
            </Button>
            {auth.token ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => navigate(isPlatformAdmin(auth.user) ? '/admin/profile' : '/profile')}
              >
                Back to profile
              </Button>
            ) : null}
          </div>
          {resendMessage ? <p role="status" style={{ marginTop: 16 }}>{resendMessage}</p> : null}
          {!auth.token ? (
            <p className="auth-links">
              <Link to="/auth">Sign in to resend</Link>
            </p>
          ) : null}
        </>
      ) : status === 'loading' ? (
        <p role="status">Verifying your email…</p>
      ) : status === 'success' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <p role="status">{message}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              type="button"
              onClick={() => navigate(isPlatformAdmin(auth.user) ? '/admin/profile' : '/profile')}
            >
              View profile
            </Button>
            <Button variant="ghost" type="button" onClick={() => navigate(getPostLoginPath(auth.user))}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <p role="alert">{message}</p>
          <Button variant="primary" type="button" onClick={() => void resendVerification()}>
            Resend verification email
          </Button>
        </div>
      )}
      {!token || status === 'idle' ? (
        <p className="auth-links">
          <Link to="/dashboard">Go to dashboard</Link>
        </p>
      ) : null}
    </>
  );
}
