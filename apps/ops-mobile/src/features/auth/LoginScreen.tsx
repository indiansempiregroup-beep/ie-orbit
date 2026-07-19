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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { brand, colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { login, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to sign in.'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={[brand.primary, '#2563EB', brand.accent]}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}
      >
        <BrandMark light />
        <Text style={styles.heroQuote}>{brand.tagline}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to manage your business</Text>

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
              <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                {remember ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Sign in" size="lg" fullWidth loading={loading} onPress={onSubmit} />
        </View>

        <View style={styles.footerLinks}>
          <Text style={styles.footer}>
            Have an invitation?{' '}
            <Text style={styles.link} onPress={() => navigation.navigate('AcceptInvitation', {})}>
              Accept invite
            </Text>
          </Text>
          <Text style={styles.footer}>
            New business?{' '}
            <Text style={styles.link} onPress={() => navigation.navigate('RegisterWizard')}>
              Register free
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  heroQuote: { ...typography.body, color: 'rgba(255,255,255,0.85)', lineHeight: 22 },
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
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rememberLabel: { ...typography.caption, color: colors.mutedForeground },
  link: { ...typography.label, color: colors.primary, fontWeight: '600' },
  error: { ...typography.caption, color: colors.destructive },
  footerLinks: { gap: spacing.sm, marginTop: spacing.xxl },
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
