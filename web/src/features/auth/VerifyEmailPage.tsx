import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useAuthContext } from '../../contexts/AuthContext';
import { useEmailVerification } from '../../hooks/useEmailVerification';
import { usePageMeta } from '../../hooks/usePageMeta';
import { getPostLoginPath, hasTenantOpsRole, isPlatformAdmin } from '../../utils/roles';
import { redirectToOpsMobileWeb } from '../../lib/impersonation';

type VerifyEmailPageProps = {
  token?: string;
};

export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  usePageMeta({ title: 'Verify email — IE Platform' });
  const auth = useAuthContext();
  const navigate = useNavigate();
  const { resendState, message: resendMessage, debugToken, resendVerification } = useEmailVerification();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(token ? 'loading' : 'idle');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState(token ?? '');
  const accessToken = auth.token;
  const restore = auth.restore;

  async function submitToken(verificationToken: string) {
    const trimmed = verificationToken.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Enter the 6-digit code from your email.');
      return;
    }
    setStatus('loading');
    try {
      const client = createAuthenticatedClient(accessToken ?? undefined);
      const response = await client.auth.verifyEmail({ token: trimmed });
      setStatus('success');
      setMessage(`Email verified for ${response.data.email}.`);
      await restore();
    } catch (err) {
      setStatus('error');
      setMessage(getApiErrorMessage(err, 'Verification failed.'));
    }
  }

  useEffect(() => {
    if (!token) return;
    const verificationToken = token;
    let cancelled = false;
    async function verify() {
      setStatus('loading');
      try {
        const client = createAuthenticatedClient(accessToken ?? undefined);
        const response = await client.auth.verifyEmail({ token: verificationToken });
        if (!cancelled) {
          setStatus('success');
          setMessage(`Email verified for ${response.data.email}.`);
          await restore();
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
    // Verify the link token once; restore() updates auth and must not re-submit a used token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const tenantOps = hasTenantOpsRole(auth.user);
  const profilePath = isPlatformAdmin(auth.user) ? '/admin/profile' : '/profile';

  function goToApp() {
    if (tenantOps) {
      redirectToOpsMobileWeb();
      return;
    }
    navigate(getPostLoginPath(auth.user));
  }

  function goToProfile() {
    if (tenantOps) {
      redirectToOpsMobileWeb();
      return;
    }
    navigate(profilePath);
  }

  if (token && status === 'loading') {
    return <p role="status">Verifying your email…</p>;
  }

  if (token && status === 'success') {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <h1>Email verified</h1>
        <p role="status">{message}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button variant="primary" type="button" onClick={goToProfile}>
            View profile
          </Button>
          <Button variant="ghost" type="button" onClick={goToApp}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Email verification</h1>
      <p className="auth-lead">
        {auth.user?.email
          ? `We sent a 6-digit code to ${auth.user.email}. Enter it below, or open the link from the email.`
          : 'Enter the 6-digit code from your email, or resend it below.'}
      </p>
      <p className="auth-lead" style={{ marginTop: 8 }}>
        In local development, open Mailpit at{' '}
        <a href="http://localhost:8025" target="_blank" rel="noreferrer">localhost:8025</a>.
      </p>
      {token && status === 'error' ? <p role="alert">{message}</p> : null}
      {!token && status === 'error' ? <p role="alert">{message}</p> : null}
      {!token && status === 'success' ? <p role="status">{message}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitToken(code);
        }}
        style={{ marginTop: 16 }}
      >
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="6-digit code"
        />
        <Button variant="primary" type="submit" disabled={status === 'loading'} style={{ width: '100%' }}>
          {status === 'loading' ? 'Verifying…' : 'Verify email'}
        </Button>
      </form>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            void resendVerification().then((sent) => {
              if (sent) setCode('');
            });
          }}
          disabled={resendState === 'loading'}
        >
          {resendState === 'loading' ? 'Sending…' : resendState === 'sent' ? 'Email sent' : 'Resend verification email'}
        </Button>
        {auth.token ? (
          <Button variant="ghost" type="button" onClick={goToProfile}>
            Back to profile
          </Button>
        ) : null}
      </div>
      {resendMessage ? <p role="status" style={{ marginTop: 16 }}>{resendMessage}</p> : null}
      {debugToken ? (
        <Button
          variant="primary"
          type="button"
          style={{ marginTop: 12 }}
          onClick={() => {
            setCode(debugToken);
            void submitToken(debugToken);
          }}
        >
          Verify with local code
        </Button>
      ) : null}
      {auth.token ? (
        <p className="auth-links">
          <button type="button" className="auth-links" onClick={goToApp} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}>
            Go to workspace
          </button>
        </p>
      ) : (
        <p className="auth-links">
          <Link to="/auth">Sign in</Link>
        </p>
      )}
    </>
  );
}
