import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { canManageTeam } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const isPlatformAdmin = user?.roles?.includes('platform_admin') || user?.roles?.includes('super_admin');

  return (
    <View style={styles.screen}>
      <OpsHeader title="More" subtitle={activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Workspace'} />
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <MenuRow icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
        <MenuRow icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
        <MenuRow icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
        <MenuRow icon="bar-chart-2" label="Business intelligence" onPress={() => navigation.navigate('BI', { tab: 'overview' })} />
        <MenuRow icon="file-text" label="Reports" onPress={() => navigation.navigate('Reports')} />
        <MenuRow icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} />
        {canManageTeam(user) ? <MenuRow icon="mail" label="Team & invitations" onPress={() => navigation.navigate('Team')} /> : null}
        {isPlatformAdmin ? <MenuRow icon="shield" label="Platform admin" onPress={() => navigation.navigate('Admin')} /> : null}
        <MenuRow icon="user" label="Profile" onPress={() => navigation.navigate('Profile')} />
        <MenuRow icon="log-out" label="Sign out" destructive onPress={() => void logout()} />
      </RefreshableScrollView>
    </View>
  );
}

function MenuRow({ icon, label, onPress, destructive }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuLeft}>
        <Feather name={icon} size={18} color={destructive ? colors.destructive : colors.primary} />
        <Text style={[styles.menuLabel, destructive && styles.destructive]}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  menuLabel: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  destructive: { color: colors.destructive },
});
