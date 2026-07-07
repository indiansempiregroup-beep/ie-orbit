import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { mobileClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';

export function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
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
      Alert.alert('Password updated', 'Your password has been changed successfully.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Unable to update', err instanceof Error ? err.message : 'Please try again.');
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
  const primary = branding?.primaryColor ?? colors.primary;

  return (
    <ProfileMenuScreen title="Privacy & Security" onBack={() => navigation.goBack()}>
      <Text style={styles.body}>
        Your data is stored securely and used only to manage your appointments with {branding?.appName ?? 'this business'}.
      </Text>
      <Button label="Change password" fullWidth primaryColor={primary} onPress={() => navigation.navigate('ChangePassword')} />
      <Text style={styles.body}>
        We never sell your personal information. You can update your profile details or sign out at any time from the Profile tab.
      </Text>
    </ProfileMenuScreen>
  );
}

export function PaymentMethodsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ProfileMenuScreen title="Payment Methods" onBack={() => navigation.goBack()}>
      <View style={styles.comingSoon}>
        <Text style={styles.comingTitle}>Payments coming soon</Text>
        <Text style={styles.body}>
          In-app payments and saved cards will be available in a future update. You can pay at the salon for now.
        </Text>
      </View>
    </ProfileMenuScreen>
  );
}

export function ReviewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ProfileMenuScreen title="My Reviews" onBack={() => navigation.goBack()}>
      <View style={styles.comingSoon}>
        <Text style={styles.comingTitle}>Reviews coming soon</Text>
        <Text style={styles.body}>
          After completed appointments you will be able to rate your experience and share feedback here.
        </Text>
      </View>
    </ProfileMenuScreen>
  );
}

export function HelpSupportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bootstrap, branding } = useBootstrap();
  const business = bootstrap?.business;

  return (
    <ProfileMenuScreen title="Help & Support" onBack={() => navigation.goBack()}>
      <Text style={styles.body}>Need help with your booking? Contact {branding?.appName ?? 'us'} directly.</Text>
      {business?.phone ? <Text style={styles.contact}>Phone: {business.phone}</Text> : null}
      {business?.email ? <Text style={styles.contact}>Email: {business.email}</Text> : null}
      {business?.formatted_address ? <Text style={styles.contact}>Address: {business.formatted_address}</Text> : null}
      <Text style={styles.faqTitle}>FAQs</Text>
      <Text style={styles.body}>• How do I reschedule? Open your appointment from Home or My Appointments.</Text>
      <Text style={styles.body}>• Can I cancel? Yes, up to 24 hours before your visit where policy allows.</Text>
      <Text style={styles.body}>• How do I update my phone number? Go to Profile → Personal Information.</Text>
    </ProfileMenuScreen>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.mutedForeground, lineHeight: 22 },
  contact: { ...typography.label, color: colors.foreground },
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
  faqTitle: { ...typography.title, color: colors.foreground, marginTop: spacing.md },
});
