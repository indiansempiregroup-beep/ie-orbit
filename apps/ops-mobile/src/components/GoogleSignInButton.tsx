import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { getApiErrorMessage } from '../utils/format';
import { useGoogleIdTokenAuth } from '../utils/googleAuth';

type Props = {
  onIdToken: (idToken: string) => Promise<void>;
  disabled?: boolean;
  label?: string;
};

export function GoogleSignInButton({ onIdToken, disabled, label = 'Continue with Google' }: Props) {
  const { configured, promptForIdToken } = useGoogleIdTokenAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return null;
  }

  async function onPress() {
    if (busy || disabled) return;
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
        disabled={disabled || busy}
        onPress={() => void onPress()}
        style={({ pressed }) => [styles.button, (disabled || busy) && styles.disabled, pressed && styles.pressed]}
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

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typography.caption, color: colors.mutedForeground },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.88 },
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
  markText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#4285F4' },
  label: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive, textAlign: 'center' },
});
