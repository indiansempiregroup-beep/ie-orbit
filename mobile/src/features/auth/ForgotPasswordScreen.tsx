import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { mobileClient } from '../../api/client';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setSubmitting(true);
    try {
      await mobileClient.auth.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "We couldn't send a reset link right now. Please check the email and try again.",
          'forgot',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.back} onPress={() => navigation.navigate('Login')}>
        <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
        <Text style={styles.backText}>Back to sign in</Text>
      </Pressable>

      {!sent ? (
        <>
          <View style={styles.iconWrap}>
            <Feather name="lock" size={24} color={colors.warning} />
          </View>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>Enter your email and we&apos;ll send reset instructions.</Text>
          <View style={styles.form}>
            <Input
              label="Email address"
              leftIcon="mail"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {error ? <FormAlert message={error} /> : null}
            <Button label="Send reset link" size="lg" fullWidth loading={submitting} primaryColor={primary} onPress={onSubmit} />
          </View>
        </>
      ) : (
        <View style={styles.success}>
          <View style={styles.successIcon}>
            <Feather name="check" size={28} color={colors.success} />
          </View>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            We sent a password reset link to {email}. The link expires in 15 minutes.
          </Text>
          <Button label="Back to sign in" fullWidth primaryColor={primary} onPress={() => navigation.navigate('Login')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, paddingTop: 56 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xxxl },
  backText: { ...typography.body, color: colors.mutedForeground },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.heading, color: colors.foreground, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.xxl },
  form: { gap: spacing.lg },
  success: { alignItems: 'center', gap: spacing.lg },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
