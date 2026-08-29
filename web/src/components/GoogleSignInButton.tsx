import { useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '../lib/apiClient';
import {
  currentGoogleOrigin,
  googleOriginAllowlistHint,
  isGoogleSignInConfigured,
  mountGoogleSignInButton,
} from '../lib/googleAuth';

type Props = {
  onIdToken: (idToken: string) => Promise<void>;
  disabled?: boolean;
};

export function GoogleSignInButton({ onIdToken, disabled }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onIdTokenRef = useRef(onIdToken);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : currentGoogleOrigin();
  const showOriginHint = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  onIdTokenRef.current = onIdToken;

  useEffect(() => {
    const host = hostRef.current;
    if (!isGoogleSignInConfigured() || !host) return;
    let cancelled = false;
    void mountGoogleSignInButton(host, (idToken) => {
      if (cancelled) return;
      setError(null);
      void onIdTokenRef.current(idToken).catch((err) => {
        setError(getApiErrorMessage(err, 'Google sign-in failed. Please try again.'));
      });
    }).catch((err) => {
      if (!cancelled) {
        setError(
          `${getApiErrorMessage(err, 'Google sign-in failed to load.')} ${googleOriginAllowlistHint()}`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isGoogleSignInConfigured()) {
    return null;
  }

  return (
    <div className="google-signin">
      <div className="google-signin-divider">
        <span>or</span>
      </div>
      <div
        ref={hostRef}
        className={`google-signin-button${disabled ? ' is-disabled' : ''}`}
        aria-disabled={disabled}
      />
      {error ? <div role="alert" className="auth-error">{error}</div> : null}
      {showOriginHint ? (
        <p className="google-signin-hint">
          If Google says Access blocked, edit the existing Web client and add {origin} as both a
          JavaScript origin and a redirect URI. Port 8082 is ops only; this site is port 3000.
        </p>
      ) : null}
    </div>
  );
}
