import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[primary, '#2563EB', colors.accent]} style={styles.hero}>
        <View style={styles.heroContent}>
          <BrandMark />
          <Text style={styles.heroQuote}>
            Book appointments effortlessly and stay connected with your favorite salon.
          </Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your account to continue</Text>

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
          <Input
            label="Password"
            leftIcon="lock"
            placeholder="Your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <View style={styles.row}>
            <Pressable style={styles.remember} onPress={() => setRemember((v) => !v)}>
              <View style={[styles.checkbox, remember && { backgroundColor: primary, borderColor: primary }]}>
                {remember ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={[styles.link, { color: primary }]}>Forgot password?</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Sign in"
            size="lg"
            fullWidth
            loading={submitting}
            primaryColor={primary}
            onPress={onSubmit}
          />
        </View>

        <Text style={styles.footer}>
          Don&apos;t have an account?{' '}
          <Text style={[styles.link, { color: primary }]} onPress={() => navigation.navigate('Register')}>
            Sign up free
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { paddingTop: 56, paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
  heroContent: { gap: spacing.lg },
  heroQuote: { ...typography.body, color: 'rgba(255,255,255,0.85)', lineHeight: 22, marginTop: spacing.md },
  formWrap: { flexGrow: 1, padding: spacing.xxl, paddingTop: spacing.xxxl },
  title: { ...typography.heading, color: colors.foreground, marginBottom: 4 },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.xxl },
  form: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remember: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rememberLabel: { ...typography.caption, color: colors.mutedForeground },
  link: { ...typography.label, fontWeight: '600' },
  error: { ...typography.caption, color: colors.destructive },
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xxl },
});
