import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { opsClient } from '../../api/client';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { layout } from '../../theme/layout';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function VerifyEmailScreen() {
  const { user, refreshProfile, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await opsClient.auth.verifyEmail({ token: trimmed });
      await refreshProfile();
      setMessage('Email verified.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
        isDesktop && styles.wrapDesktop,
      ]}
    >
      <View style={[styles.card, isDesktop && styles.cardDesktop]}>
        <BrandMark />
        <View style={styles.copyBlock}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.copy}>
            Confirm {user?.email ?? 'your email'} to open your workspace. This step is required.
          </Text>
        </View>
        <Input
          label="Verification code"
          value={token}
          onChangeText={setToken}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="6-digit code"
        />
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Verify email"
          loading={loading}
          fullWidth
          size="lg"
          onPress={() => void verify(token)}
        />
        <Button
          label={resending ? 'Sending…' : 'Resend verification email'}
          variant="outline"
          fullWidth
          disabled={resending}
          onPress={async () => {
            setResending(true);
            setError(null);
            try {
              const response = await opsClient.auth.resendVerification(
                user?.email ? { email: user.email } : undefined,
              );
              const nextDebugToken = response.data.debug_token ?? null;
              setDebugToken(nextDebugToken);
              setMessage(
                nextDebugToken
                  ? `Verification email sent. Local code: ${nextDebugToken}`
                  : 'Verification email sent. Check your inbox for the 6-digit code.',
              );
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to resend.'));
            } finally {
              setResending(false);
            }
          }}
        />
        {debugToken ? (
          <Button
            label="Verify with local code"
            variant="soft"
            fullWidth
            onPress={() => {
              setToken(debugToken);
              void verify(debugToken);
            }}
          />
        ) : null}
        {__DEV__ ? (
          <Text
            style={styles.hint}
            onPress={() => {
              if (Platform.OS === 'web') {
                void Linking.openURL('http://localhost:8025');
              }
            }}
          >
            In local development, open Mailpit at localhost:8025.
          </Text>
        ) : null}
        <Button label="Sign out" variant="ghost" fullWidth onPress={() => void logout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
    justifyContent: 'center',
  },
  wrapDesktop: {
    alignItems: 'center',
  },
  card: {
    gap: spacing.lg,
    width: '100%',
  },
  cardDesktop: {
    maxWidth: layout.authCardMaxWidth,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxxl,
  },
  copyBlock: { gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  copy: { ...typography.body, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
