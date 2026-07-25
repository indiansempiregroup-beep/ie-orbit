import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { canAccessSettings, canManageTeam, formatUserRole } from '../../utils/roles';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const isPlatformAdmin = user?.roles?.includes('platform_admin') || user?.roles?.includes('super_admin');
  const displayName = user?.full_name || user?.email || 'Account';
  const showSettings = canAccessSettings(user);
  const showTeam = canManageTeam(user);

  function onSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <RefreshableScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
    >
      <View style={styles.hero}>
        <Avatar name={displayName} size="xl" src={user?.profile_photo} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.meta}>
          {activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Workspace'}
          {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
        </Text>
      </View>

      <View style={styles.menu}>
        <MenuSection title="Business">
          <MenuRow icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
          <MenuRow icon="star" label="Reviews" onPress={() => navigation.navigate('Reviews')} />
          <MenuRow icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
          <MenuRow icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
          <MenuRow
            icon="bar-chart-2"
            label="Business intelligence"
            onPress={() => navigation.navigate('BI', { tab: 'overview' })}
          />
          <MenuRow
            icon="file-text"
            label="Reports"
            last={!showSettings && !showTeam && !isPlatformAdmin}
            onPress={() => navigation.navigate('Reports')}
          />
          {showSettings ? (
            <MenuRow
              icon="settings"
              label="Settings"
              last={!showTeam && !isPlatformAdmin}
              onPress={() => navigation.navigate('Settings')}
            />
          ) : null}
          {showTeam ? (
            <MenuRow
              icon="mail"
              label="Team & invitations"
              last={!isPlatformAdmin}
              onPress={() => navigation.navigate('Team')}
            />
          ) : null}
          {isPlatformAdmin ? (
            <MenuRow
              icon="shield"
              label="Platform admin"
              last
              onPress={() => navigation.navigate('Admin')}
            />
          ) : null}
        </MenuSection>

        <MenuSection title="Account">
          <MenuRow icon="user" label="Profile" onPress={() => navigation.navigate('Profile')} />
          <MenuRow icon="log-out" label="Sign out" destructive last onPress={onSignOut} />
        </MenuSection>
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl },
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
});
