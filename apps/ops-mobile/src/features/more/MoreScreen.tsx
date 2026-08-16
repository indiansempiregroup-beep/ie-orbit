import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopContent } from '../../components/DesktopContent';
import { Avatar } from '../../components/ui/Avatar';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  canAccessReports,
  canAccessSettings,
  canAccessStaffDirectory,
  formatUserRole,
} from '../../utils/roles';
import { hasShopie } from '../../utils/products';
import { PlanFeature, SHOPIE_BOOKS_FEATURES } from '../../utils/planFeatures';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { confirmAction } from '../../utils/confirmAction';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

/**
 * More menu — Vyapar-inspired groups.
 * Sale/Compliance only under Books; Offices/Team only under Settings.
 * Reports absorbed into BI.
 */
export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const displayName = user?.full_name || user?.email || t('common.account');
  const showSettings = canAccessSettings(user);
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const showShop = hasShopie(activeBusiness?.product_subscriptions);
  const { has, hasAny } = usePlanFeatures();
  const showBooks = showShop && hasAny(SHOPIE_BOOKS_FEATURES);
  const workspaceLabel = activeBusiness?.display_name ?? activeBusiness?.business_name ?? t('common.workspace');

  async function onSignOut() {
    const ok = await confirmAction({
      title: t('auth.signOut'),
      message: t('auth.signOutConfirm'),
      confirmLabel: t('auth.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) await logout();
  }

  return (
    <RefreshableScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl },
        isDesktop && styles.contentDesktop,
      ]}
    >
      <DesktopContent>
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
        {showShop ? (
          <MenuSection title="Sale">
            {has(PlanFeature.shopiePos) ? (
              <MenuRow
                icon="shopping-cart"
                label={t('nav.pos')}
                subtitle="Counter GST bill → Books"
                onPress={() => navigation.navigate('ShopPos')}
              />
            ) : null}
            {showBooks ? (
              <MenuRow
                icon="book-open"
                label={t('nav.shopBooks')}
                subtitle="Sale invoices, purchase, cash & reports"
                onPress={() => navigation.navigate('ShopBooks')}
              />
            ) : null}
            {has(PlanFeature.shopieProducts) ? (
              <MenuRow
                icon="shopping-bag"
                label={t('nav.shopProducts')}
                onPress={() => navigation.navigate('ShopProducts')}
              />
            ) : null}
            {has(PlanFeature.shopieOrders) ? (
              <MenuRow
                icon="list"
                label={t('nav.shopOrders')}
                subtitle="Pickup & delivery shopping"
                onPress={() => navigation.navigate('ShopOrders')}
              />
            ) : null}
            {has(PlanFeature.shopieReturns) ? (
              <MenuRow
                icon="rotate-ccw"
                label={t('nav.shopReturns')}
                onPress={() => navigation.navigate('ShopReturns')}
              />
            ) : null}
            {has(PlanFeature.shopieDeliveryZones) ? (
              <MenuRow
                icon="map-pin"
                label={t('nav.shopDeliveryZones')}
                onPress={() => navigation.navigate('ShopDeliveryZones')}
              />
            ) : null}
            {has(PlanFeature.shopieCoupons) ? (
              <MenuRow
                icon="tag"
                label={t('nav.shopCoupons')}
                subtitle="Codes for online checkout"
                onPress={() => navigation.navigate('ShopCoupons')}
              />
            ) : null}
            <MenuRow
              icon="heart"
              label={t('nav.shopPets')}
              last
              onPress={() => navigation.navigate('ShopPets')}
            />
          </MenuSection>
        ) : null}

        {hasAny([
          PlanFeature.shopieGrowWhatsapp,
          PlanFeature.shopieGrowGoogle,
          PlanFeature.shopieGrowSync,
          PlanFeature.shopieGrowUtilities,
          PlanFeature.shopieGrowAds,
          PlanFeature.shopieCustomerReferral,
        ]) ? (
          <MenuSection title="Grow">
            {showShop && has(PlanFeature.shopieGrowWhatsapp) ? (
              <MenuRow
                icon="message-circle"
                label="WhatsApp"
                subtitle="Party picker, message & attachment"
                onPress={() => navigation.navigate('GrowWhatsApp')}
              />
            ) : null}
            {showShop && has(PlanFeature.shopieGrowGoogle) ? (
              <MenuRow
                icon="globe"
                label="Google Profile"
                subtitle="Listing URL & place ID"
                onPress={() => navigation.navigate('GrowGoogleProfile')}
              />
            ) : null}
            {showShop && has(PlanFeature.shopieGrowSync) ? (
              <MenuRow
                icon="share-2"
                label="Sync & share"
                subtitle="Export business snapshot"
                onPress={() => navigation.navigate('GrowSyncShare')}
              />
            ) : null}
            {showShop && has(PlanFeature.shopieGrowUtilities) ? (
              <MenuRow
                icon="tool"
                label="Utilities"
                subtitle="GST, margin, discount & EMI"
                onPress={() => navigation.navigate('GrowUtilities')}
              />
            ) : null}
            {has(PlanFeature.shopieGrowAds) ? (
              <MenuRow
                icon="image"
                label="Ads"
                subtitle="Customer app banners (max 5)"
                onPress={() => navigation.navigate('GrowAds')}
              />
            ) : null}
            {has(PlanFeature.shopieCustomerReferral) ? (
              <MenuRow
                icon="gift"
                label="Referrals"
                subtitle="Loyalty points for invites"
                last
                onPress={() => navigation.navigate('GrowReferral')}
              />
            ) : null}
          </MenuSection>
        ) : null}

        <MenuSection title={t('settings.business')}>
          {has(PlanFeature.appointieCustomers) || showShop ? (
            <MenuRow icon="users" label={t('settings.customers')} onPress={() => navigation.navigate('Customers')} />
          ) : null}
          {has(PlanFeature.appointieReviews) ? (
            <MenuRow icon="star" label={t('settings.reviews')} onPress={() => navigation.navigate('Reviews')} />
          ) : null}
          {has(PlanFeature.appointieServices) ? (
            <MenuRow
              icon="package"
              label={t('settings.services')}
              last={!showStaff && !showReports && !showSettings}
              onPress={() => navigation.navigate('Services')}
            />
          ) : null}
          {showStaff && has(PlanFeature.appointieStaff) ? (
            <MenuRow
              icon="user-check"
              label={t('bookings.staff')}
              last={!showReports && !showSettings}
              onPress={() => navigation.navigate('StaffList')}
            />
          ) : null}
          {showReports ? (
            <MenuRow
              icon="bar-chart-2"
              label={t('nav.businessIntelligence')}
              subtitle="Overview, growth & reports"
              last={!showSettings}
              onPress={() => navigation.navigate('BI', { tab: 'overview' })}
            />
          ) : null}
          {showSettings ? (
            <MenuRow
              icon="settings"
              label={t('settings.title')}
              subtitle="Profile, offices, team & plans"
              last
              onPress={() => navigation.navigate('Settings')}
            />
          ) : null}
        </MenuSection>

        <MenuSection title={t('common.account')}>
          <MenuRow icon="user" label={t('profile.title')} onPress={() => navigation.navigate('Profile')} />
          <MenuRow icon="log-out" label={t('auth.signOut')} destructive last onPress={onSignOut} />
        </MenuSection>
        </View>
      </DesktopContent>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl },
  contentDesktop: { paddingHorizontal: 0 },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
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
