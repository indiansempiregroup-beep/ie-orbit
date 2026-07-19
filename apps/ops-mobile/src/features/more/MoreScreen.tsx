import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { canManageTeam, formatUserRole } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const isPlatformAdmin = user?.roles?.includes('platform_admin') || user?.roles?.includes('super_admin');
  const displayName = user?.full_name || user?.email || 'Account';

  function onSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <RefreshableScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background]}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}
      >
        <Avatar name={displayName} size="xl" />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.meta}>
          {activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Workspace'}
          {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
        </Text>
      </LinearGradient>

      <View style={styles.menu}>
        <MenuRow icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
        <MenuRow icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
        <MenuRow icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
        <MenuRow
          icon="bar-chart-2"
          label="Business intelligence"
          onPress={() => navigation.navigate('BI', { tab: 'overview' })}
        />
        <MenuRow icon="file-text" label="Reports" onPress={() => navigation.navigate('Reports')} />
        <MenuRow icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} />
        {canManageTeam(user) ? (
          <MenuRow icon="mail" label="Team & invitations" onPress={() => navigation.navigate('Team')} />
        ) : null}
        {isPlatformAdmin ? (
          <MenuRow icon="shield" label="Platform admin" onPress={() => navigation.navigate('Admin')} />
        ) : null}
        <MenuRow icon="user" label="Profile" onPress={() => navigation.navigate('Profile')} />
        <MenuRow icon="log-out" label="Sign out" destructive onPress={onSignOut} />
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  name: { ...typography.heading, color: colors.foreground, marginTop: spacing.md },
  email: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm, textAlign: 'center' },
  menu: { paddingHorizontal: spacing.xl, gap: spacing.md },
});
