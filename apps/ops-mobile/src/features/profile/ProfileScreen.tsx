import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DesktopPage } from '../../components/DesktopPage';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatUserRole } from '../../utils/roles';
import { isExpoGo } from '../../utils/biometrics';
import { confirmAction } from '../../utils/confirmAction';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function ProfileScreen() {
  const { t } = useTranslation();
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
  const displayName = user?.full_name || user?.email || t('profile.title');
  const [busy, setBusy] = useState(false);
  const faceIdBlockedInExpoGo = isExpoGo() && Platform.OS === 'ios';

  useEffect(() => {
    void refreshBiometricState().catch(() => undefined);
  }, [refreshBiometricState]);

  async function onSignOut() {
    const ok = await confirmAction({
      title: t('auth.signOut'),
      message: biometricEnabled
        ? `You'll return to the login screen. You can sign back in with ${biometricLabel}.`
        : t('auth.signOutConfirm'),
      confirmLabel: t('auth.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) await logout();
  }

  function onToggleBiometric(next: boolean) {
    if (faceIdBlockedInExpoGo) {
      Alert.alert(
        `${biometricLabel} needs a development build`,
        `${biometricLabel} cannot run inside Expo Go. Use a development or production build of IE Orbit later to enable it.`,
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
    <DesktopPage>
      <FormScreen contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.hero}>
          <Avatar name={displayName} size="xl" src={user?.profile_photo} />
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.meta}>
            {activeBusiness?.display_name ?? activeBusiness?.business_name ?? t('common.workspace')}
            {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
          </Text>
        </View>

        <View style={styles.menu}>
          <MenuSection title={t('common.account')}>
            <MenuRow icon="edit-3" label={t('profile.editProfile')} onPress={() => navigation.navigate('ProfileEdit')} />
            <MenuRow
              icon="bell"
              label={t('profile.notificationPreferences')}
              onPress={() => navigation.navigate('NotificationPreferences')}
            />
            <MenuRow icon="lock" label={t('profile.changePassword')} onPress={() => navigation.navigate('Security')} />
            <MenuRow
              icon="smartphone"
              label={t('profile.sessions')}
              last={Boolean(user?.email_verified_at)}
              onPress={() => navigation.navigate('Sessions')}
            />
            {!user?.email_verified_at ? (
              <MenuRow icon="mail" label={t('profile.verifyEmail')} last onPress={() => navigation.navigate('VerifyEmail')} />
            ) : null}
          </MenuSection>

          <MenuSection title={t('profile.security')}>
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
          </MenuSection>

          <MenuSection title={t('profile.session')}>
            <MenuRow icon="log-out" label={t('auth.signOut')} destructive last onPress={onSignOut} />
          </MenuSection>
        </View>
      </FormScreen>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.xl },
  hero: { alignItems: 'center', paddingBottom: spacing.md },
  name: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.foreground,
    marginTop: spacing.md,
    letterSpacing: -0.4,
  },
  email: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  meta: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  menu: { gap: spacing.xl },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
});
