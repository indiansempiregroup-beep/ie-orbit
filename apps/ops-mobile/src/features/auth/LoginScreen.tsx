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
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { brand, colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { layout } from '../../theme/layout';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { markBiometricPromptShown, wasBiometricPromptShown } from '../../utils/biometrics';
import { getApiErrorMessage } from '../../utils/format';
import { emailFieldError } from '../../utils/emailValidation';
import { requiredMessage } from '../../utils/formValidation';
import { decodeGoogleIdToken, isGoogleAccountNotRegistered } from '../../utils/googleAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { opsClient } from '../../api/client';

const RESEND_COOLDOWN_SECONDS = 30;

export function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { isDesktop } = useBreakpoint();
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
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [mobileOtpEnabled, setMobileOtpEnabled] = useState(false);
  const [loginChannel, setLoginChannel] = useState<'email' | 'whatsapp'>('email');
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string }>({});
  const [sendingCode, setSendingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [googleSignup, setGoogleSignup] = useState<{
    googleIdToken: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await opsClient.auth.getOtpCapabilities({ client: 'ops' });
        setMobileOtpEnabled(Boolean(response.data.mobile_otp_via_whatsapp));
      } catch {
        setMobileOtpEnabled(false);
      }
    })();
  }, []);

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
    setError(null);
    if (options?.resend && resendCooldown > 0) return;
    if (loginChannel === 'email') {
      const emailErr = emailFieldError(email);
      if (emailErr) {
        setFieldErrors({ email: emailErr });
        return;
      }
    } else if (!phone.trim()) {
      setFieldErrors({ email: requiredMessage('Mobile number') });
      return;
    }
    setFieldErrors({});
    setSendingCode(true);
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
      setSendingCode(false);
    }
  }

  async function onVerifyCode() {
    setError(null);
    if (!code.trim()) {
      setFieldErrors({ code: requiredMessage('Sign-in code') });
      return;
    }
    setFieldErrors({});
    try {
      await loginWithOtp({
        channel: loginChannel === 'whatsapp' ? 'whatsapp' : 'email',
        identifier: loginChannel === 'whatsapp' ? phone.trim() : email.trim(),
        code: code.trim(),
        rememberMe: remember,
      });
      await offerBiometricEnrollment();
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is invalid or expired.', 'login'));
    }
  }

  async function onBiometricLogin() {
    setError(null);
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

  const formBody = (
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
          onChangeText={(value) => {
            setPhone(value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          error={fieldErrors.email}
        />
      ) : (
        <Input
          label={t('common.email')}
          required
          leftIcon="mail"
          placeholder={t('auth.emailPlaceholder')}
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
          <View style={[styles.checkbox, remember && styles.checkboxOn]}>
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
        loading={(loading || sendingCode) && !biometricBusy}
        onPress={() => void (otpStep === 'code' ? onVerifyCode() : onSendCode())}
      />
      {otpStep === 'code' ? (
        <>
          <Button
            label={resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
            variant="ghost"
            fullWidth
            disabled={sendingCode || resendCooldown > 0}
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
        disabled={loading || biometricBusy}
        onIdToken={async (idToken) => {
          try {
            setGoogleSignup(null);
            await loginWithGoogle(idToken, remember);
            await offerBiometricEnrollment();
          } catch (err) {
            if (!isGoogleAccountNotRegistered(err)) throw err;
            const claims = decodeGoogleIdToken(idToken);
            setGoogleSignup({
              googleIdToken: idToken,
              email: claims.email,
              firstName: claims.given_name,
              lastName: claims.family_name,
            });
          }
        }}
      />
      {googleSignup ? (
        <View style={styles.signupPrompt}>
          <Text style={styles.signupTitle}>No business on this Google account</Text>
          <Text style={styles.signupCopy}>
            You need to create your business before you can sign in. Use the link below to register.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('RegisterWizard', googleSignup)}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Create your business</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isDesktop ? (
        <View style={styles.desktopCanvas}>
          <ScrollView
            contentContainerStyle={styles.desktopScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.desktopCard}>
              <View style={styles.desktopBrand}>
                <BrandMark />
                <Text style={styles.desktopTagline}>{brand.tagline}</Text>
              </View>
              <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
              <Text style={styles.subtitle}>{t('auth.signIn')}</Text>
              {formBody}
              <View style={styles.footerLinks}>
                <Text style={styles.footer}>
                  New business?{' '}
                  <Text style={styles.link} onPress={() => navigation.navigate('RegisterWizard')}>
                    Register free
                  </Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : (
        <>
          <LinearGradient
            colors={[brand.gradientStart, brand.gradientEnd]}
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
            <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('auth.signIn')}</Text>
            {formBody}
            <View style={styles.footerLinks}>
              <Text style={styles.footer}>
                New business?{' '}
                <Text style={styles.link} onPress={() => navigation.navigate('RegisterWizard')}>
                  Register free
                </Text>
              </Text>
            </View>
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  desktopCanvas: {
    flex: 1,
    backgroundColor: colors.background,
  },
  desktopScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.desktopGutter,
  },
  desktopCard: {
    width: '100%',
    maxWidth: layout.authCardMaxWidth,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxxl,
    gap: spacing.md,
  },
  desktopBrand: { gap: spacing.sm, marginBottom: spacing.md },
  desktopTagline: {
    ...typography.body,
    color: colors.mutedForeground,
  },
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
  channelRow: { flexDirection: 'row', gap: spacing.sm },
  signupPrompt: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  signupTitle: { ...typography.label, color: colors.foreground },
  signupCopy: { ...typography.body, color: colors.mutedForeground },
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
  footerLinks: { gap: spacing.sm, marginTop: spacing.xxl },
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
