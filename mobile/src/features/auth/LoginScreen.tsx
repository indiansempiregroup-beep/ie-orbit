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
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { markBiometricPromptShown, wasBiometricPromptShown } from '../../utils/biometrics';
import { getApiErrorMessage } from '../../utils/format';
import { emailFieldError } from '../../utils/emailValidation';
import { requiredMessage } from '../../utils/formValidation';
import { customerAppFeatures } from '../../utils/customerFeatures';
import type { AuthStackParamList } from '../../navigation/types';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const RESEND_COOLDOWN_SECONDS = 30;

export function LoginScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const {
    sendOtp,
    loginWithOtp,
    loginWithGoogle,
    loginWithBiometrics,
    enableBiometrics,
    loading,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    refreshBiometricState,
  } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { headerPaddingTop } = useScreenInsets();
  const primary = branding?.primaryColor ?? colors.primary;
  const secondary = branding?.secondaryColor ?? '#2563EB';
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const appName = branding?.appName ?? 'us';
  const heroQuote = showBooking && showShop
    ? `Book, shop, and stay connected with ${appName}.`
    : showShop
      ? `Shop ${appName} and keep your orders in one place.`
      : `Book with ${appName} and manage your visits in one place.`;

  const [email, setEmail] = useState(route.params?.email ?? '');
  const mobileOtpEnabled = Boolean(bootstrap?.otp_auth?.mobile_otp_via_whatsapp);
  const [loginChannel, setLoginChannel] = useState<'email' | 'whatsapp'>('email');
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(
    route.params?.email
      ? 'An account with this email already exists. Sign in instead.'
      : '',
  );
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
                  await enableBiometrics(email.trim());
                } catch (err) {
                  Alert.alert('Unable to enable', getApiErrorMessage(err, `Could not enable ${biometricLabel}.`));
                }
              })();
            }, 500);
          },
        },
      ],
    );
  }, [biometricAvailable, biometricEnabled, biometricLabel, enableBiometrics, email]);

  async function onSendCode(options?: { resend?: boolean }) {
    setError('');
    if (options?.resend && resendCooldown > 0) return;
    if (loginChannel === 'email') {
      const emailError = emailFieldError(email);
      if (emailError) {
        setFieldErrors({ email: emailError });
        return;
      }
    } else if (!phone.trim()) {
      setFieldErrors({ email: requiredMessage('Mobile number') });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await sendOtp({
        channel: loginChannel === 'whatsapp' ? 'whatsapp' : 'email',
        identifier: loginChannel === 'whatsapp' ? phone.trim() : email.trim(),
        purpose: 'login',
      });
      setOtpStep('code');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to send sign-in code.', 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode() {
    setError('');
    if (!code.trim()) {
      setFieldErrors({ code: requiredMessage('Sign-in code') });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await loginWithOtp({
        channel: loginChannel === 'whatsapp' ? 'whatsapp' : 'email',
        identifier: loginChannel === 'whatsapp' ? phone.trim() : email.trim(),
        code: code.trim(),
        remember,
      });
      await offerBiometricEnrollment();
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is invalid or expired.', 'login'));
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
      <StatusBar style="light" />
      <LinearGradient colors={[primary, secondary]} style={[styles.hero, { paddingTop: headerPaddingTop }]}>
        <View style={styles.heroContent}>
          <BrandMark />
          <Text style={styles.heroQuote}>{heroQuote}</Text>
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

          {mobileOtpEnabled && otpStep === 'idle' ? (
            <View style={styles.channelRow}>
              <Button
                label="Email OTP"
                variant={loginChannel === 'email' ? 'primary' : 'outline'}
                size="sm"
                onPress={() => setLoginChannel('email')}
              />
              <Button
                label="Mobile OTP"
                variant={loginChannel === 'whatsapp' ? 'primary' : 'outline'}
                size="sm"
                onPress={() => setLoginChannel('whatsapp')}
              />
            </View>
          ) : null}
          {loginChannel === 'whatsapp' ? (
            <Input
              label="Mobile number"
              required
              leftIcon="phone"
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              error={fieldErrors.email}
            />
          ) : (
            <Input
              label={t('common.email')}
              required
              leftIcon="mail"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              error={fieldErrors.email}
            />
          )}
          {otpStep === 'code' ? (
            <Input
              label="Sign-in code"
              required
              leftIcon="key"
              placeholder="6-digit code"
              keyboardType="number-pad"
              value={code}
              onChangeText={(value) => {
                setCode(value);
                setFieldErrors((current) => ({ ...current, code: undefined }));
              }}
              error={fieldErrors.code}
            />
          ) : null}

          <View style={styles.row}>
            <Pressable style={styles.remember} onPress={() => setRemember((v) => !v)}>
              <View style={[styles.checkbox, remember && { backgroundColor: primary, borderColor: primary }]}>
                {remember ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </Pressable>
          </View>

          {error ? <FormAlert message={error} /> : null}

          <Button
            label={otpStep === 'code' ? 'Verify and sign in' : 'Sign in with OTP'}
            size="lg"
            fullWidth
            loading={(submitting || loading) && !biometricBusy}
            primaryColor={primary}
            onPress={() => void (otpStep === 'code' ? onVerifyCode() : onSendCode())}
          />
          {otpStep === 'code' ? (
            <>
              <Button
                label={resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                variant="ghost"
                fullWidth
                disabled={submitting || resendCooldown > 0}
                onPress={() => void onSendCode({ resend: true })}
              />
              <Button
                label={loginChannel === 'whatsapp' ? 'Use a different number' : 'Use a different email'}
                variant="ghost"
                fullWidth
                onPress={() => {
                  setOtpStep('idle');
                  setCode('');
                  setResendCooldown(0);
                }}
              />
            </>
          ) : null}
          <GoogleSignInButton
            disabled={loading || submitting || biometricBusy}
            onIdToken={async (idToken) => {
              await loginWithGoogle(idToken, remember);
              await offerBiometricEnrollment();
            }}
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
  hero: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
  heroContent: { gap: spacing.lg },
  heroQuote: { ...typography.body, color: 'rgba(255,255,255,0.85)', lineHeight: 22, marginTop: spacing.md },
  formWrap: { flexGrow: 1, padding: spacing.xxl, paddingTop: spacing.xxxl },
  title: { ...typography.heading, color: colors.foreground, marginBottom: 4 },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.xxl },
  form: { gap: spacing.lg },
  channelRow: { flexDirection: 'row', gap: spacing.sm },
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
