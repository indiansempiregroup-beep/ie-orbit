import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAuthenticatedClient } from '../lib/apiClient';
import { getApiErrorMessage } from '../lib/apiClient';
import { useAuth } from './useAuth';

export function useEmailVerification() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);

  const isVerified = Boolean(auth.user?.email_verified_at);
  const isPending = auth.user?.status === 'pending_verification' || !isVerified;

  const resendVerification = useCallback(async (emailOverride?: string) => {
    const email = (emailOverride || auth.user?.email || '').trim();
    if (!auth.token && !email) {
      setMessage(t('auth.verifyBanner.needEmail'));
      return false;
    }
    setResendState('loading');
    setMessage(null);
    setDebugToken(null);
    try {
      const client = createAuthenticatedClient(auth.token ?? undefined);
      const response = await client.auth.resendVerification(email ? { email } : undefined);
      setResendState('sent');
      const nextDebugToken = response.data.debug_token ?? null;
      setDebugToken(nextDebugToken);
      setMessage(
        nextDebugToken
          ? t('auth.verifyBanner.sentDebug', { code: nextDebugToken })
          : t('auth.verifyBanner.sentMessage'),
      );
      return true;
    } catch (error) {
      setResendState('idle');
      setMessage(getApiErrorMessage(error, t('auth.verifyBanner.resendFailed')));
      return false;
    }
  }, [auth.token, auth.user?.email, t]);

  return {
    isVerified,
    isPending,
    resendState,
    message,
    debugToken,
    resendVerification,
    clearMessage: () => {
      setMessage(null);
      setDebugToken(null);
    },
  };
}
