import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, Phone } from 'lucide-react';
import { createApiClient } from '@ie-orbit/sdk';
import { useAuthContext } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../lib/apiClient';
import { invalidEmailMessage } from '../../lib/emailValidation';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PostAuthRedirect } from '../../components/PostAuthRedirect';
import { registerStartPath } from '../onboarding/affiliateCode';
import { decodeGoogleIdToken, isGoogleAccountNotRegistered } from '../../lib/googleAuth';

type OtpStep = 'idle' | 'code';
type LoginChannel = 'email' | 'whatsapp';

const publicClient = createApiClient({ baseUrl: '/api/v1' });

function AuthField({
  label,
  required,
  error,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="ops-login-field">
      <span className="ops-login-label">
        {label}
        {required ? (
          <span className="ops-login-required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </span>
      <span className={`ops-login-control${error ? ' is-error' : ''}`}>
        <span className="ops-login-icon">{icon}</span>
        {children}
      </span>
      {error ? (
        <span role="alert" className="ops-login-field-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function AuthPage() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Sign in — IE Orbit' });
  const auth = useAuthContext();
  const [otpStep, setOtpStep] = useState<OtpStep>('idle');
  const [loginChannel, setLoginChannel] = useState<LoginChannel>('email');
  const [mobileOtpEnabled, setMobileOtpEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string }>({});
  const [sending, setSending] = useState(false);
  const [googleSignup, setGoogleSignup] = useState<{
    googleIdToken: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await publicClient.auth.getOtpCapabilities({ client: 'ops' });
        setMobileOtpEnabled(Boolean(response.data.mobile_otp_via_whatsapp));
      } catch {
        setMobileOtpEnabled(false);
      }
    })();
  }, []);

  if (auth.loading) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (auth.token && auth.user) {
    return <PostAuthRedirect />;
  }

  async function handleSendCode() {
    setError(null);
    if (loginChannel === 'email') {
      const emailErr = invalidEmailMessage(email);
      if (emailErr) {
        setFieldErrors({ email: emailErr });
        return;
      }
    } else if (!phone.trim()) {
      setFieldErrors({ email: 'Mobile number is required' });
      return;
    }
    setFieldErrors({});
    setSending(true);
    try {
      await auth.sendOtp({
        channel: loginChannel,
        identifier: loginChannel === 'whatsapp' ? phone.trim() : email.trim(),
      });
      setOtpStep('code');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to send sign-in code. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    if (!code.trim()) {
      setFieldErrors({ code: 'Sign-in code is required' });
      return;
    }
    setFieldErrors({});
    try {
      await auth.loginWithOtp({
        channel: loginChannel,
        identifier: loginChannel === 'whatsapp' ? phone.trim() : email.trim(),
        code: code.trim(),
        remember,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is invalid or expired. Please try again.'));
    }
  }

  return (
    <>
      <h1 className="ops-login-title">{t('auth.welcomeBack')}</h1>
      <p className="ops-login-subtitle">{t('auth.signIn')}</p>

      <div className="ops-login-form">
        {mobileOtpEnabled && otpStep === 'idle' ? (
          <div className="ops-login-channels">
            <button
              type="button"
              className={`ops-login-channel${loginChannel === 'email' ? ' is-on' : ''}`}
              onClick={() => setLoginChannel('email')}
            >
              Email OTP
            </button>
            <button
              type="button"
              className={`ops-login-channel${loginChannel === 'whatsapp' ? ' is-on' : ''}`}
              onClick={() => setLoginChannel('whatsapp')}
            >
              Mobile OTP
            </button>
          </div>
        ) : null}

        {loginChannel === 'whatsapp' ? (
          <AuthField
            label="Mobile number"
            required
            error={fieldErrors.email}
            icon={<Phone size={16} strokeWidth={2} />}
          >
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              placeholder="10-digit mobile"
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => {
                setPhone(event.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
            />
          </AuthField>
        ) : (
          <AuthField
            label={t('common.email')}
            required
            error={fieldErrors.email}
            icon={<Mail size={16} strokeWidth={2} />}
          >
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder={t('auth.emailPlaceholder')}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
            />
          </AuthField>
        )}

        {otpStep === 'code' ? (
          <AuthField
            label="Sign-in code"
            required
            error={fieldErrors.code}
            icon={<KeyRound size={16} strokeWidth={2} />}
          >
            <input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              placeholder="6-digit code"
              aria-invalid={Boolean(fieldErrors.code)}
              onChange={(event) => {
                setCode(event.target.value);
                setFieldErrors((current) => ({ ...current, code: undefined }));
              }}
            />
          </AuthField>
        ) : null}

        <button type="button" className="ops-login-remember" onClick={() => setRemember((value) => !value)}>
          <span className={`ops-login-check${remember ? ' is-on' : ''}`}>{remember ? '✓' : null}</span>
          Remember me
        </button>

        {error ? (
          <div role="alert" className="auth-error">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="ops-login-cta"
          disabled={sending || (auth.loading && otpStep === 'code')}
          onClick={() => void (otpStep === 'code' ? handleVerifyCode() : handleSendCode())}
        >
          {otpStep === 'code' ? 'Verify and sign in' : 'Sign in with OTP'}
        </button>
        {otpStep === 'code' ? (
          <button
            type="button"
            className="ops-login-ghost"
            onClick={() => {
              setOtpStep('idle');
              setCode('');
            }}
          >
            {loginChannel === 'whatsapp' ? 'Use a different number' : 'Use a different email'}
          </button>
        ) : null}

        <GoogleSignInButton
          disabled={auth.loading}
          hideOriginHint
          onIdToken={async (idToken) => {
            try {
              setGoogleSignup(null);
              setError(null);
              await auth.loginWithGoogle(idToken, remember);
            } catch (err) {
              if (!isGoogleAccountNotRegistered(err)) {
                setError(getApiErrorMessage(err, 'Google sign-in failed. Please try again.'));
                return;
              }
              const claims = decodeGoogleIdToken(idToken);
              setGoogleSignup({
                googleIdToken: idToken,
                email: claims.email,
                firstName: claims.given_name,
                lastName: claims.family_name,
              });
            }
          }}
        />

        {googleSignup ? (
          <div className="auth-signup-prompt">
            <strong>No business on this Google account</strong>
            <p>You need to create your business before you can sign in. Use the link below to register.</p>
            <Link to={registerStartPath()} state={googleSignup}>
              Create your business
            </Link>
          </div>
        ) : null}
      </div>

      <p className="ops-login-footer">
        New business? <Link to={registerStartPath()}>Register free</Link>
      </p>
    </>
  );
}
