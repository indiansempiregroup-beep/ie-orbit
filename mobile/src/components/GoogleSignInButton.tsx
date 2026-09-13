import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type View as ViewType,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { getApiErrorMessage } from '../utils/format';
import {
  googleOriginAllowlistHint,
  isGoogleSignInConfigured,
  mountGoogleSignInButton,
  useGoogleIdTokenAuth,
} from '../utils/googleAuth';

type Props = {
  onIdToken: (idToken: string) => Promise<void>;
  disabled?: boolean;
  label?: string;
};

function GoogleSignInButtonWeb({ onIdToken, disabled }: Props) {
  const hostRef = useRef<ViewType | null>(null);
  const onIdTokenRef = useRef(onIdToken);
  const [error, setError] = useState<string | null>(null);

  onIdTokenRef.current = onIdToken;

  useEffect(() => {
    if (!isGoogleSignInConfigured()) return;
    const parent = hostRef.current as unknown as HTMLElement | null;
    if (!parent || typeof document === 'undefined') return;

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.display = 'flex';
    host.style.justifyContent = 'center';
    parent.replaceChildren(host);

    let cancelled = false;
    void mountGoogleSignInButton(host, (idToken) => {
      if (cancelled) return;
      setError(null);
      void onIdTokenRef.current(idToken).catch((err) => {
        setError(getApiErrorMessage(err, 'Google sign-in failed. Please try again.', 'login'));
      });
    }).catch((err) => {
      if (!cancelled) {
        setError(
          `${getApiErrorMessage(err, 'Google sign-in failed to load.', 'login')} ${googleOriginAllowlistHint()}`,
        );
      }
    });
    return () => {
      cancelled = true;
      parent.replaceChildren();
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.or}>or</Text>
        <View style={styles.line} />
      </View>
      <View
        ref={hostRef}
        collapsable={false}
        style={[styles.webHost, disabled ? styles.disabled : null]}
        pointerEvents={disabled ? 'none' : 'auto'}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function GoogleSignInButtonNative({
  onIdToken,
  disabled,
  label = 'Continue with Google',
}: Props) {
  const { configured, promptForIdToken, ready } = useGoogleIdTokenAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return null;
  }

  async function onPress() {
    if (busy || disabled || !ready) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await promptForIdToken();
      if (!idToken) return;
      await onIdToken(idToken);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Google sign-in failed. Please try again.', 'login'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.or}>or</Text>
        <View style={styles.line} />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || busy || !ready}
        onPress={() => void onPress()}
        style={({ pressed }) => [
          styles.button,
          (disabled || busy || !ready) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.foreground} />
        ) : (
          <>
            <View style={styles.mark}>
              <Text style={styles.markText}>G</Text>
            </View>
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function GoogleSignInButton(props: Props) {
  if (!isGoogleSignInConfigured()) {
    return null;
  }
  if (Platform.OS === 'web') {
    return <GoogleSignInButtonWeb {...props} />;
  }
  return <GoogleSignInButtonNative {...props} />;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typography.caption, color: colors.mutedForeground },
  webHost: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  markText: { fontSize: 13, fontWeight: '700', color: '#4285F4' },
  label: { ...typography.label, fontWeight: '600', color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive, textAlign: 'center' },
});
