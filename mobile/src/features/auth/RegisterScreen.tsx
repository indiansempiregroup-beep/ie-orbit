import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { customerAppFeatures } from '../../utils/customerFeatures';
import { mobileClient } from '../../api/client';
import type { AuthStackParamList } from '../../navigation/types';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register, loginWithGoogle } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const primary = branding?.primaryColor ?? colors.primary;
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const appName = branding?.appName ?? 'us';
  const perks = showBooking && showShop
    ? ['Book appointments in seconds', 'Shop products and track orders', 'Get reminders before each visit']
    : showShop
      ? ['Browse products and order in seconds', 'Track deliveries and returns', 'Save addresses for faster checkout']
      : ['Book appointments in seconds', 'Manage your visit history', 'Get reminders before each visit'];
  const subtitle = showBooking && showShop
    ? `Join ${appName} to book, shop, and stay connected.`
    : showShop
      ? `Join ${appName} to shop and track your orders.`
      : `Join ${appName} to book and manage appointments.`;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function applyReferralIfNeeded() {
    const code = referralCode.trim();
    if (code && tenantSlug && businessCode) {
      try {
        await mobileClient.mobile.applyReferral({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          referral_code: code,
        });
      } catch {
        // Account is created even if the invite code is invalid; user can retry from Profile.
      }
    }
  }

  async function onSubmit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim() || undefined,
      });
      await applyReferralIfNeeded();
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "We couldn't create your account with those details. Please review and try again.",
          'register',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: headerPaddingTop }]} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.form}>
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Input label="First name" placeholder="Sarah" value={firstName} onChangeText={setFirstName} />
            </View>
            <View style={styles.nameField}>
              <Input label="Last name" placeholder="Mitchell" value={lastName} onChangeText={setLastName} />
            </View>
          </View>
          <Input
            label="Email"
            leftIcon="mail"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="Phone (optional)"
            leftIcon="phone"
            placeholder="+1 555 000 0000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Input
            label="Password"
            leftIcon="lock"
            placeholder="Min. 8 characters"
            secureTextEntry
            hint="Use a mix of letters, numbers, and symbols"
            value={password}
            onChangeText={setPassword}
          />
          {bootstrap?.referral?.enabled ? (
            <Input
              label="Invite code (optional)"
              leftIcon="gift"
              placeholder="Friend's code"
              autoCapitalize="characters"
              value={referralCode}
              onChangeText={(value) => setReferralCode(value.toUpperCase())}
              hint={`You'll help a friend earn ${bootstrap.referral.points_per_referral} points`}
            />
          ) : null}

          <View style={styles.perks}>
            {perks.map((perk) => (
              <View key={perk} style={styles.perkRow}>
                <Feather name="check-circle" size={14} color={primary} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>

          {error ? <FormAlert message={error} /> : null}

          <Button label="Create account" size="lg" fullWidth loading={submitting} primaryColor={primary} onPress={onSubmit} />
          <GoogleSignInButton
            disabled={submitting}
            onIdToken={async (idToken) => {
              setSubmitting(true);
              try {
                await loginWithGoogle(idToken);
                await applyReferralIfNeeded();
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </View>

        <Text style={styles.footer}>
          Already have an account?{' '}
          <Text style={[styles.link, { color: primary }]} onPress={() => navigation.navigate('Login')}>
            Sign in
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, gap: spacing.lg },
  title: { ...typography.heading, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  form: { gap: spacing.lg },
  nameRow: { flexDirection: 'row', gap: spacing.md },
  nameField: { flex: 1 },
  perks: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  perkText: { ...typography.caption, color: colors.secondaryForeground, flex: 1 },
  footer: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  link: { fontWeight: '600' },
});
