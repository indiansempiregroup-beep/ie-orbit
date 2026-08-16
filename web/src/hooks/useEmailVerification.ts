import { useCallback, useState } from 'react';
import { createAuthenticatedClient } from '../lib/apiClient';
import { getApiErrorMessage } from '../lib/apiClient';
import { useAuth } from './useAuth';

export function useEmailVerification() {
  const auth = useAuth();
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);

  const isVerified = Boolean(auth.user?.email_verified_at);
  const isPending = auth.user?.status === 'pending_verification' || !isVerified;

  const resendVerification = useCallback(async (emailOverride?: string) => {
    const email = (emailOverride || auth.user?.email || '').trim();
    if (!auth.token && !email) {
      setMessage('Enter your email or sign in to resend the verification email.');
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
          ? `Verification email sent. Local code: ${nextDebugToken}`
          : 'Verification email sent. Check your inbox for the 6-digit code.',
      );
      return true;
    } catch (error) {
      setResendState('idle');
      setMessage(getApiErrorMessage(error, 'Unable to resend verification email.'));
      return false;
    }
  }, [auth.token, auth.user?.email]);

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
