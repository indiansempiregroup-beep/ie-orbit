import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { canManageTeam } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const isPlatformAdmin = user?.roles?.includes('platform_admin') || user?.roles?.includes('super_admin');

  return (
    <View style={styles.screen}>
      <OpsHeader title="Settings" subtitle="Workspace configuration" />
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <MenuRow icon="briefcase" label="Business profile" onPress={() => navigation.navigate('BusinessProfile')} />
        <MenuRow icon="edit-3" label="Edit business profile" onPress={() => navigation.navigate('BusinessEdit')} />
        <MenuRow icon="package" label="Products & plans" onPress={() => navigation.navigate('ProductSettings')} />
        <MenuRow icon="map-pin" label="Branches" onPress={() => navigation.navigate('Branches')} />
        {canManageTeam(user) ? <MenuRow icon="users" label="Team & invitations" onPress={() => navigation.navigate('Team')} /> : null}
        {isPlatformAdmin ? <MenuRow icon="shield" label="Platform admin" onPress={() => navigation.navigate('Admin')} /> : null}
      </RefreshableScrollView>
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Feather name={icon} size={18} color={colors.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.body, color: colors.foreground, fontWeight: '600' },
});
