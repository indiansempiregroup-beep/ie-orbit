import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../lib/apiClient';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PostAuthRedirect } from '../../components/PostAuthRedirect';
import { registerStartPath } from '../onboarding/affiliateCode';

export function AuthPage() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Sign in — IE Orbit' });
  const auth = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (auth.loading) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (auth.token && auth.user) {
    return <PostAuthRedirect />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await auth.login(email, password, remember);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "That email or password doesn't look right. Please try again."),
      );
    }
  }

  return (
    <>
      <h1>{t('auth.signIn')} — IE Orbit</h1>
      <p className="auth-lead">{t('auth.welcomeBack')}</p>
      <form onSubmit={handleSubmit}>
        <Input
          label={t('common.email')}
          type="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
        />
        <Input
          label={t('auth.password')}
          type="password"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder={t('auth.passwordPlaceholder')}
        />
        <label className="auth-checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t('auth.rememberMe')}</span>
        </label>
        {error ? <div role="alert" className="auth-error">{error}</div> : null}
        <Button type="submit" variant="primary" disabled={auth.loading} style={{ width: '100%' }}>
          {auth.loading ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
      <p className="auth-links">
        <Link to="/auth/forgot-password">{t('auth.forgotPassword')}</Link>
        <span aria-hidden="true"> · </span>
        <Link to={registerStartPath()}>{t('auth.createAccount')}</Link>
      </p>
    </>
  );
}
