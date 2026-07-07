import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { mobileClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { Button } from '../../components/ui/Button';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen({ navigation, route }: Props) {
  const { branding } = useBootstrap();
  const { user, refreshProfile, logout } = useAuth();
  const primary = branding?.primaryColor ?? colors.primary;
  const email = route.params?.email || user?.email || '';

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  const code = digits.join('');

  function updateDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
  }

  async function onVerify() {
    setError('');
    if (code.trim().length < 4) {
      setError('Enter the verification code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      await mobileClient.auth.verifyEmail({ token: code.trim() });
      await refreshProfile();
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return;
    setError('');
    try {
      await mobileClient.auth.resendVerification({ email });
      setResendMessage('A new verification code was sent to your email.');
      setResendCooldown(30);
      const timer = setInterval(() => {
        setResendCooldown((value) => {
          if (value <= 1) {
            clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend code.');
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Feather name="smartphone" size={28} color={primary} />
      </View>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        We sent a verification code to{'\n'}
        <Text style={styles.email}>{email}</Text>
      </Text>

      <View style={styles.otpRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            style={[styles.otpBox, digit ? { borderColor: primary, backgroundColor: `${primary}10` } : null]}
            keyboardType="number-pad"
            maxLength={1}
            value={digit}
            onChangeText={(value) => updateDigit(index, value)}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {verified ? <Text style={styles.success}>Email verified. You can sign in now.</Text> : null}

      <Button
        label={verified ? 'Continue' : 'Verify email'}
        size="lg"
        fullWidth
        loading={submitting}
        primaryColor={primary}
        onPress={() => {
          if (verified) return;
          void onVerify();
        }}
      />

      {!verified ? (
        <Pressable style={styles.resend} onPress={onResend} disabled={resendCooldown > 0}>
          <Text style={[styles.resendText, { color: primary }]}>
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
          </Text>
        </Pressable>
      ) : null}
      {resendMessage ? <Text style={styles.success}>{resendMessage}</Text> : null}

      <Pressable style={styles.back} onPress={() => void logout()}>
        <Feather name="log-out" size={16} color={colors.mutedForeground} />
        <Text style={styles.backText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xxl,
    paddingTop: 72,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: `${colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  title: { ...typography.heading, color: colors.foreground, marginBottom: spacing.sm, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.mutedForeground, textAlign: 'center', marginBottom: spacing.xxl },
  email: { color: colors.foreground, fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  error: { ...typography.caption, color: colors.destructive, marginBottom: spacing.md },
  success: { ...typography.body, color: colors.success, marginBottom: spacing.md, textAlign: 'center' },
  resend: { marginTop: spacing.lg },
  resendText: { ...typography.label, fontWeight: '600' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xxl },
  backText: { ...typography.body, color: colors.mutedForeground },
});
