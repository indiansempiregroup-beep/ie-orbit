import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatUserRole } from '../../utils/roles';
import { isExpoGo } from '../../utils/biometrics';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const {
    user,
    logout,
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    enableBiometrics,
    disableBiometrics,
    refreshBiometricState,
  } = useAuth();
  const { activeBusiness } = useWorkspace();
  const displayName = user?.full_name || user?.email || 'Profile';
  const [busy, setBusy] = useState(false);
  const faceIdBlockedInExpoGo = isExpoGo() && Platform.OS === 'ios';

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  function onSignOut() {
    Alert.alert(
      'Sign out',
      biometricEnabled
        ? `You'll return to the login screen. You can sign back in with ${biometricLabel}.`
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
      ],
    );
  }

  function onToggleBiometric(next: boolean) {
    if (faceIdBlockedInExpoGo) {
      Alert.alert(
        `${biometricLabel} needs a development build`,
        `${biometricLabel} cannot run inside Expo Go. Use a development or production build of IE Platform later to enable it.`,
      );
      return;
    }

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
        // Let the switch animation finish before presenting Face ID.
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
    <FormScreen contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background]}
        style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
      >
        <Avatar name={displayName} size="xl" src={user?.profile_photo} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.meta}>
          {activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Workspace'}
          {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
        </Text>
      </LinearGradient>

      <View style={styles.menu}>
        <MenuRow icon="edit-3" label="Edit profile" onPress={() => navigation.navigate('ProfileEdit')} />
        <MenuRow icon="lock" label="Change password" onPress={() => navigation.navigate('Security')} />
        <View style={styles.biometricRow}>
          <View style={styles.biometricCopy}>
            <Text style={styles.biometricTitle}>{biometricLabel} login</Text>
            <Text style={styles.biometricHint}>
              {faceIdBlockedInExpoGo
                ? `Unavailable in Expo Go · needs a development build`
                : busy
                  ? 'Updating…'
                  : biometricAvailable
                    ? biometricEnabled
                      ? `On · use after signing out`
                      : `Off · tap to enable with ${biometricLabel} only`
                    : `Not available on this device`}
            </Text>
          </View>
          <Switch
            value={biometricEnabled && !faceIdBlockedInExpoGo}
            onValueChange={onToggleBiometric}
            disabled={busy || faceIdBlockedInExpoGo || (!biometricAvailable && !biometricEnabled)}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <MenuRow icon="smartphone" label="Sessions" onPress={() => navigation.navigate('Sessions')} />
        {!user?.email_verified_at ? (
          <MenuRow icon="mail" label="Verify email" onPress={() => navigation.navigate('VerifyEmail')} />
        ) : null}
        <MenuRow icon="log-out" label="Sign out" destructive onPress={onSignOut} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  name: { ...typography.heading, color: colors.foreground, marginTop: spacing.md },
  email: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm, textAlign: 'center' },
  menu: { paddingHorizontal: spacing.xl, gap: spacing.md },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
});
