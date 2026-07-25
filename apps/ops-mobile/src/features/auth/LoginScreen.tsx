import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { brand, colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { markBiometricPromptShown, wasBiometricPromptShown } from '../../utils/biometrics';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const {
    login,
    loginWithBiometrics,
    enableBiometrics,
    loading,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    refreshBiometricState,
  } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  const offerBiometricEnrollment = useCallback(async () => {
    if (!biometricAvailable || biometricEnabled) return;
    if (await wasBiometricPromptShown()) return;

    Alert.alert(
      `Enable ${biometricLabel}?`,
      `Sign in faster next time with ${biometricLabel}. You can change this later in Profile.`,
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            void markBiometricPromptShown();
          },
        },
        {
          text: 'Enable',
          onPress: () => {
            setTimeout(() => {
              void (async () => {
                try {
                  await enableBiometrics();
                } catch (err) {
                  Alert.alert('Unable to enable', getApiErrorMessage(err, `Could not enable ${biometricLabel}.`));
                }
              })();
            }, 500);
          },
        },
      ],
    );
  }, [biometricAvailable, biometricEnabled, biometricLabel, enableBiometrics]);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    try {
      await login(email.trim(), password, remember);
      await offerBiometricEnrollment();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to sign in.'));
    }
  }

  async function onBiometricLogin() {
    setError(null);
    setBiometricBusy(true);
    try {
      await loginWithBiometrics();
    } catch (err) {
      setError(getApiErrorMessage(err, `Unable to sign in with ${biometricLabel}.`));
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={[brand.primary, brand.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}
      >
        <BrandMark light />
        <Text style={styles.heroQuote}>{brand.tagline}</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.formWrap, { paddingBottom: insets.bottom + spacing.xxxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to manage your business</Text>

        <View style={styles.form}>
          {biometricEnabled && biometricAvailable ? (
            <Pressable
              style={({ pressed }) => [styles.biometricCard, pressed && styles.pressed]}
              onPress={() => void onBiometricLogin()}
              disabled={loading || biometricBusy}
            >
              <View style={styles.biometricIcon}>
                <Feather name={Platform.OS === 'ios' ? 'smile' : 'smartphone'} size={22} color={colors.primary} />
              </View>
              <View style={styles.biometricCopy}>
                <Text style={styles.biometricTitle}>
                  {biometricBusy ? `Waiting for ${biometricLabel}…` : `Sign in with ${biometricLabel}`}
                </Text>
                <Text style={styles.biometricHint}>Quick unlock for this device</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

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

          <Button label="Sign in" size="lg" fullWidth loading={loading && !biometricBusy} onPress={onSubmit} />
        </View>

        <View style={styles.footerLinks}>
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
  heroQuote: {
    ...typography.body,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  formWrap: { flexGrow: 1, padding: spacing.xxl, paddingTop: spacing.xxxl },
  title: {
    ...typography.heading,
    color: colors.foreground,
    marginBottom: 4,
  },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.xxl },
  form: { gap: spacing.lg },
  biometricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pressed: { opacity: 0.92 },
  biometricIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remember: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.bodyBold },
  rememberLabel: { ...typography.caption, color: colors.mutedForeground },
  link: { ...typography.label, color: colors.primary },
  error: { ...typography.caption, color: colors.destructive },
  footerLinks: { gap: spacing.sm, marginTop: spacing.xxl },
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
