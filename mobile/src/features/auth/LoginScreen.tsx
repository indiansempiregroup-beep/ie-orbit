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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { markBiometricPromptShown, wasBiometricPromptShown } from '../../utils/biometrics';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
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
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  const offerBiometricEnrollment = useCallback(async () => {
    if (!biometricAvailable || biometricEnabled) return;
    if (await wasBiometricPromptShown()) return;

    Alert.alert(
      `Enable ${biometricLabel}?`,
      `Sign in faster next time with ${biometricLabel}. You can change this later in Privacy & Security.`,
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
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password, remember);
      await offerBiometricEnrollment();
    } catch (err) {
      setError(getApiErrorMessage(err, "That email or password doesn't look right. Please try again.", 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onBiometricLogin() {
    setError('');
    setBiometricBusy(true);
    try {
      await loginWithBiometrics();
    } catch (err) {
      setError(
        getApiErrorMessage(err, `Unable to sign in with ${biometricLabel}. Please try again.`, 'login'),
      );
    } finally {
      setBiometricBusy(false);
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
        <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
        <Text style={styles.subtitle}>{t('auth.signIn')}</Text>

        <View style={styles.form}>
          {biometricEnabled && biometricAvailable ? (
            <Pressable
              style={({ pressed }) => [styles.biometricCard, pressed && styles.pressed]}
              onPress={() => void onBiometricLogin()}
              disabled={loading || submitting || biometricBusy}
            >
              <View style={[styles.biometricIcon, { backgroundColor: `${primary}18` }]}>
                <Feather name={Platform.OS === 'ios' ? 'smile' : 'smartphone'} size={22} color={primary} />
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
            label={t('common.email')}
            leftIcon="mail"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label={t('auth.password')}
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
              <Text style={[styles.link, { color: primary }]}>{t('auth.forgotPassword')}</Text>
            </Pressable>
          </View>

          {error ? <FormAlert message={error} /> : null}

          <Button
            label={t('auth.signIn')}
            size="lg"
            fullWidth
            loading={(submitting || loading) && !biometricBusy}
            primaryColor={primary}
            onPress={onSubmit}
          />
        </View>

        <Text style={styles.footer}>
          Don&apos;t have an account?{' '}
          <Text style={[styles.link, { color: primary }]} onPress={() => navigation.navigate('Register')}>
            {t('auth.createAccount')}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
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
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xxl },
});
