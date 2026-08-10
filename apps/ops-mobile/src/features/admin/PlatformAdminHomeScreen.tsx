import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopPage } from '../../components/DesktopPage';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction } from '../../utils/confirmAction';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function PlatformAdminHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();

  async function onSignOut() {
    const ok = await confirmAction({
      title: 'Sign out',
      message: 'Sign out of platform admin?',
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (ok) await logout();
  }

  return (
    <DesktopPage>
      <RefreshableScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.meta}>{user?.email ?? 'Platform console'}</Text>
          <Text style={styles.hint}>Manage tenants, coupons, and audit activity.</Text>
        </View>

        <View style={styles.menu}>
          <MenuSection title="Console">
            <MenuRow
              icon="briefcase"
              label="Tenants"
              subtitle="List & manage tenants"
              onPress={() => navigation.navigate('PlatformAdminTenants')}
            />
            <MenuRow
              icon="tag"
              label="Coupons"
              subtitle="Promotional codes"
              onPress={() => navigation.navigate('PlatformAdminCoupons')}
            />
            <MenuRow
              icon="shield"
              label="Audit"
              subtitle="Platform audit events"
              last
              onPress={() => navigation.navigate('PlatformAdminAudit')}
            />
          </MenuSection>

          <MenuSection title="Account">
            <MenuRow icon="log-out" label="Sign out" destructive last onPress={onSignOut} />
          </MenuSection>
        </View>
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl },
  hero: { gap: spacing.xs, paddingBottom: spacing.lg },
  meta: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  hint: { ...typography.caption, color: colors.mutedForeground },
  menu: { gap: spacing.xl },
});
