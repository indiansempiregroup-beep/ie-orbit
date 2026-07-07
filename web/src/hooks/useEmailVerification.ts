import { useCallback, useState } from 'react';
import { createAuthenticatedClient } from '../lib/apiClient';
import { getApiErrorMessage } from '../lib/apiClient';
import { useAuth } from './useAuth';

export function useEmailVerification() {
  const auth = useAuth();
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const isVerified = Boolean(auth.user?.email_verified_at);
  const isPending = auth.user?.status === 'pending_verification' || !isVerified;

  const resendVerification = useCallback(async () => {
    if (!auth.token) {
      setMessage('Sign in to resend the verification email.');
      return false;
    }
    setResendState('loading');
    setMessage(null);
    try {
      const client = createAuthenticatedClient(auth.token);
      await client.auth.resendVerification();
      setResendState('sent');
      setMessage('Verification email sent. Check your inbox for the link.');
      return true;
    } catch (error) {
      setResendState('idle');
      setMessage(getApiErrorMessage(error, 'Unable to resend verification email.'));
      return false;
    }
  }, [auth.token]);

  return {
    isVerified,
    isPending,
    resendState,
    message,
    resendVerification,
    clearMessage: () => setMessage(null),
  };
}
