import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  canAccessReports,
  canAccessSettings,
  canAccessStaffDirectory,
  canManageTeam,
  formatUserRole,
} from '../../utils/roles';
import { hasShopie } from '../../utils/products';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const displayName = user?.full_name || user?.email || t('common.account');
  const showSettings = canAccessSettings(user);
  const showTeam = canManageTeam(user);
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const showShop = hasShopie(activeBusiness?.product_subscriptions);
  const workspaceLabel = activeBusiness?.display_name ?? activeBusiness?.business_name ?? t('common.workspace');

  function onSignOut() {
    Alert.alert(t('auth.signOut'), t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOut'), style: 'destructive', onPress: () => void logout() },
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
          {workspaceLabel}
          {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
        </Text>
      </View>

      <View style={styles.menu}>
        <MenuSection title={t('settings.business')}>
          <MenuRow icon="users" label={t('settings.customers')} onPress={() => navigation.navigate('Customers')} />
          <MenuRow icon="star" label={t('settings.reviews')} onPress={() => navigation.navigate('Reviews')} />
          {showShop ? (
            <>
              <MenuRow icon="shopping-cart" label={t('nav.pos')} onPress={() => navigation.navigate('ShopPos')} />
              <MenuRow icon="shopping-bag" label={t('nav.shopProducts')} onPress={() => navigation.navigate('ShopProducts')} />
              <MenuRow icon="list" label={t('nav.shopOrders')} onPress={() => navigation.navigate('ShopOrders')} />
              <MenuRow icon="camera" label={t('nav.scanBarcode')} onPress={() => navigation.navigate('BarcodeScanner')} />
              <MenuRow icon="rotate-ccw" label={t('nav.shopReturns')} onPress={() => navigation.navigate('ShopReturns')} />
              <MenuRow icon="map-pin" label={t('nav.shopDeliveryZones')} onPress={() => navigation.navigate('ShopDeliveryZones')} />
              <MenuRow icon="heart" label={t('nav.shopPets')} onPress={() => navigation.navigate('ShopPets')} />
            </>
          ) : null}
          <MenuRow
            icon="package"
            label={t('settings.services')}
            last={!showStaff && !showReports && !showSettings && !showTeam && !showShop}
            onPress={() => navigation.navigate('Services')}
          />
          {showStaff ? (
            <MenuRow
              icon="user-check"
              label={t('bookings.staff')}
              last={!showReports && !showSettings && !showTeam}
              onPress={() => navigation.navigate('StaffList')}
            />
          ) : null}
          {showReports ? (
            <>
              <MenuRow
                icon="bar-chart-2"
                label={t('nav.businessIntelligence')}
                onPress={() => navigation.navigate('BI', { tab: 'overview' })}
              />
              <MenuRow
                icon="file-text"
                label={t('nav.reports')}
                last={!showSettings && !showTeam}
                onPress={() => navigation.navigate('Reports')}
              />
            </>
          ) : null}
          {showSettings ? (
            <>
              <MenuRow
                icon="map-pin"
                label={t('settings.offices')}
                onPress={() => navigation.navigate('Branches')}
              />
              <MenuRow
                icon="settings"
                label={t('settings.title')}
                last={!showTeam}
                onPress={() => navigation.navigate('Settings')}
              />
            </>
          ) : null}
          {showTeam ? (
            <MenuRow
              icon="mail"
              label={t('settings.team')}
              last
              onPress={() => navigation.navigate('Team')}
            />
          ) : null}
        </MenuSection>

        <MenuSection title={t('common.account')}>
          <MenuRow icon="user" label={t('profile.title')} onPress={() => navigation.navigate('Profile')} />
          <MenuRow icon="log-out" label={t('auth.signOut')} destructive last onPress={onSignOut} />
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
