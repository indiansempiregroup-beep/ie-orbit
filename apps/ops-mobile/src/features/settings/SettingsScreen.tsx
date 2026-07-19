import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { MenuRow } from '../../components/ui/MenuRow';
import { useAuth } from '../../contexts/AuthContext';
import { canManageTeam } from '../../utils/roles';
import { colors, spacing } from '../../theme/tokens';
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
        {canManageTeam(user) ? (
          <MenuRow icon="users" label="Team & invitations" onPress={() => navigation.navigate('Team')} />
        ) : null}
        {isPlatformAdmin ? (
          <MenuRow icon="shield" label="Platform admin" onPress={() => navigation.navigate('Admin')} />
        ) : null}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
