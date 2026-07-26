import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { MobileReview } from '@ie-platform/sdk';
import { mobileClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';

export function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { biometricEnabled, disableBiometrics } = useAuth();
  const primary = branding?.primaryColor ?? colors.primary;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!newPassword || newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please confirm your new password.');
      return;
    }
    setLoading(true);
    try {
      await mobileClient.auth.changePassword({ current_password: currentPassword, new_password: newPassword });
      if (biometricEnabled) {
        await disableBiometrics();
        Alert.alert(
          'Password updated',
          'Biometric login was disabled — re-enable it in Privacy & Security.',
        );
      } else {
        Alert.alert('Password updated', 'Your password has been changed successfully.');
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Unable to update', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProfileMenuScreen title="Change Password" onBack={() => navigation.goBack()}>
      <Input label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
      <Input label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
      <Input label="Confirm new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
      <Button label="Update password" size="lg" fullWidth loading={loading} primaryColor={primary} onPress={onSubmit} />
    </ProfileMenuScreen>
  );
}

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshProfile } = useAuth();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const prefs = (user?.notification_preferences ?? {}) as Record<string, boolean>;
  const [email, setEmail] = useState(prefs.email !== false);
  const [push, setPush] = useState(prefs.push !== false);
  const [sms, setSms] = useState(Boolean(prefs.sms));
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setLoading(true);
    try {
      await mobileClient.auth.patchMe({
        notification_preferences: { email, push, sms },
      });
      await refreshProfile();
      Alert.alert('Saved', 'Notification preferences updated.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProfileMenuScreen title="Notification Preferences" onBack={() => navigation.goBack()}>
      <PrefRow label="Email notifications" value={email} onChange={setEmail} />
      <PrefRow label="Push notifications" value={push} onChange={setPush} />
      <PrefRow label="SMS reminders" value={sms} onChange={setSms} />
      <Button label="Save preferences" size="lg" fullWidth loading={loading} primaryColor={primary} onPress={onSave} />
    </ProfileMenuScreen>
  );
}

function PrefRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function PrivacySecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const {
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    enableBiometrics,
    disableBiometrics,
    refreshBiometricState,
  } = useAuth();
  const primary = branding?.primaryColor ?? colors.primary;
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshBiometricState().catch(() => undefined);
    }, [refreshBiometricState]),
  );

  function onToggleBiometric(next: boolean) {
    if (!biometricAvailable) {
      Alert.alert(
        `${biometricLabel} unavailable`,
        `Set up ${biometricLabel} in your phone Settings first, then try again.`,
      );
      return;
    }

    if (!next) {
      Alert.alert(`Disable ${biometricLabel}`, `Stop using ${biometricLabel} to sign in on this device?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setBusy(true);
                await disableBiometrics();
                Alert.alert('Disabled', `${biometricLabel} login is off.`);
              } catch (err) {
                Alert.alert('Unable to disable', getApiErrorMessage(err, 'Could not update biometric login.'));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]);
      return;
    }

    void (async () => {
      try {
        setBusy(true);
        await new Promise((resolve) => setTimeout(resolve, 400));
        await enableBiometrics();
        Alert.alert(
          `${biometricLabel} enabled`,
          `Sign out, then tap “Sign in with ${biometricLabel}” on the login screen.`,
        );
      } catch (err) {
        Alert.alert(`Unable to enable ${biometricLabel}`, getApiErrorMessage(err, 'Please try again.'));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <ProfileMenuScreen title="Privacy & Security" onBack={() => navigation.goBack()}>
      <Text style={styles.body}>
        Your data is stored securely and used only to manage your appointments with {branding?.appName ?? 'this business'}.
      </Text>

      <View style={styles.biometricRow}>
        <View style={styles.biometricCopy}>
          <Text style={styles.biometricTitle}>{biometricLabel} login</Text>
          <Text style={styles.biometricHint}>
            {busy
              ? 'Updating…'
              : biometricAvailable
                ? biometricEnabled
                  ? `On · use after signing out`
                  : `Off · tap to enable with ${biometricLabel} only`
                : `Not available on this device`}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={onToggleBiometric}
          disabled={busy || (!biometricAvailable && !biometricEnabled)}
          trackColor={{ true: primary }}
        />
      </View>

      <Button label="Change password" fullWidth primaryColor={primary} onPress={() => navigation.navigate('ChangePassword')} />
      <Text style={styles.body}>
        We never sell your personal information. You can update your profile details or sign out at any time from the Profile tab.
      </Text>
    </ProfileMenuScreen>
  );
}

export function PaymentMethodsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  return (
    <ProfileMenuScreen title="Payment Methods" onBack={() => navigation.goBack()}>
      <View style={styles.paymentCard}>
        <Text style={styles.comingTitle}>Pay at venue</Text>
        <Text style={styles.body}>
          Your default payment method for {branding?.appName ?? 'this salon'} is pay at the venue. Online cards and UPI
          checkout will arrive in a later release.
        </Text>
        <Text style={styles.body}>
          When you book in the app, your appointment is confirmed and you settle payment when you visit.
        </Text>
      </View>
    </ProfileMenuScreen>
  );
}

export function ReviewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;
  const [reviews, setReviews] = useState<MobileReview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
    try {
      const res = await mobileClient.mobile.listMyReviews({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setReviews(res.data);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode]);

  useFocusEffect(
    useCallback(() => {
      void loadReviews();
    }, [loadReviews]),
  );

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  return (
    <ProfileMenuScreen title="My Reviews" onBack={() => navigation.goBack()}>
      {loading ? <ActivityIndicator color={primary} /> : null}
      {!loading && !reviews.length ? (
        <View style={styles.comingSoon}>
          <Text style={styles.comingTitle}>No reviews yet</Text>
          <Text style={styles.body}>
            After a completed appointment, open it from My Appointments and leave a rating.
          </Text>
        </View>
      ) : null}
      {reviews.map((review) => (
        <View key={review.id} style={styles.reviewCard}>
          <Text style={styles.comingTitle}>{review.service_name || 'Appointment'}</Text>
          <Text style={[styles.rating, { color: primary }]}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
          {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
          <Text style={styles.meta}>#{review.booking_number}</Text>
        </View>
      ))}
    </ProfileMenuScreen>
  );
}

export function HelpSupportScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { bootstrap, branding } = useBootstrap();
  const business = bootstrap?.business;
  const [articles, setArticles] = useState<Array<{ id: string; slug: string; title: string; category?: string }>>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const isPlatformAdmin = (user?.roles ?? []).some((role) =>
    ['platform_admin', 'super_admin'].includes(role),
  );

  useEffect(() => {
    void mobileClient.help
      .articles()
      .then((res) => setArticles(res.data.articles ?? []))
      .catch(() => setArticles([]));
  }, []);

  async function submitTicket() {
    if (!subject.trim()) {
      Alert.alert('Subject required', 'Please enter a short subject.');
      return;
    }
    try {
      await mobileClient.support.createTicket({ subject, body });
      setSubject('');
      setBody('');
      setStatus('Ticket submitted. Our team will follow up by email.');
    } catch (err) {
      Alert.alert('Could not submit', getApiErrorMessage(err, 'Please try again.'));
    }
  }

  return (
    <ProfileMenuScreen title={t('help.title')} onBack={() => navigation.goBack()}>
      <Text style={styles.body}>Need help with your booking? Contact {branding?.appName ?? 'us'} directly.</Text>
      {business?.phone ? <Text style={styles.contact}>Phone: {business.phone}</Text> : null}
      {business?.email ? <Text style={styles.contact}>Email: {business.email}</Text> : null}
      {business?.formatted_address ? <Text style={styles.contact}>Address: {business.formatted_address}</Text> : null}

      {isPlatformAdmin ? (
        <Button
          label="Open platform admin tools"
          onPress={() => navigation.navigate('PlatformAdmin')}
        />
      ) : null}

      <Text style={styles.faqTitle}>{t('help.articles')}</Text>
      {articles.length === 0 ? (
        <Text style={styles.body}>No published articles yet.</Text>
      ) : (
        articles.map((article) => (
          <Text key={article.id} style={styles.body}>
            • {article.title}
            {article.category ? ` (${article.category})` : ''}
          </Text>
        ))
      )}

      <Text style={styles.faqTitle}>{t('help.contactSupport')}</Text>
      <Input label={t('help.subject')} value={subject} onChangeText={setSubject} />
      <Input label={t('help.details')} value={body} onChangeText={setBody} multiline />
      <Button label={t('help.submitTicket')} onPress={() => void submitTicket()} />
      {status ? <Text style={styles.body}>{status}</Text> : null}

      <Text style={styles.faqTitle}>FAQs</Text>
      <Text style={styles.body}>• How do I reschedule? Open your appointment from Home or My Appointments.</Text>
      <Text style={styles.body}>• Can I cancel? Yes, up to 24 hours before your visit where policy allows.</Text>
      <Text style={styles.body}>• How do I update my phone number? Go to Profile → Personal Information.</Text>
    </ProfileMenuScreen>
  );
}

export function PlatformAdminScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tenants, setTenants] = useState<Array<{ id: string; display_name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void mobileClient.platform
      .tenants()
      .then((res) => setTenants(res.data.tenants ?? []))
      .catch((err) => setError(getApiErrorMessage(err, 'Unable to load platform tenants')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProfileMenuScreen title="Platform admin" onBack={() => navigation.goBack()}>
      <Text style={styles.body}>
        Platform admin tools in the customer app. Use web /admin or ops-mobile for full management.
      </Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.body}>{error}</Text> : null}
      {tenants.map((tenant) => (
        <View key={tenant.id} style={styles.prefRow}>
          <Text style={styles.biometricTitle}>{tenant.display_name}</Text>
          <Text style={styles.biometricHint}>{tenant.status}</Text>
        </View>
      ))}
    </ProfileMenuScreen>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.mutedForeground, lineHeight: 22 },
  contact: { ...typography.label, color: colors.foreground },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  prefLabel: { ...typography.body, color: colors.foreground, fontWeight: '500' },
  comingSoon: { gap: spacing.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl },
  comingTitle: { ...typography.title, color: colors.foreground },
  paymentCard: {
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  reviewCard: {
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rating: { ...typography.label, fontWeight: '700', letterSpacing: 1 },
  meta: { ...typography.caption, color: colors.mutedForeground },
  faqTitle: { ...typography.title, color: colors.foreground, marginTop: spacing.md },
});
