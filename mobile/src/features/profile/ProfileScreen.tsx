import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Avatar } from '../../components/ui/Avatar';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { customerAppFeatures } from '../../utils/customerFeatures';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopOrder } from '@ie-platform/sdk';

const menuItems = [
  { icon: 'calendar', labelKey: 'bookings.myAppointments', route: 'BookingHistory' as const, feature: 'mobile_booking' as const },
  { icon: 'shopping-bag', labelKey: 'shop.myOrders', route: 'ShopOrderHistory' as const, feature: 'mobile_shop' as const },
  { icon: 'rotate-ccw', labelKey: 'shop.returns', route: 'MyReturns' as const, feature: 'mobile_shop' as const },
  { icon: 'heart', labelKey: 'shop.myPets', route: 'MyPets' as const, feature: 'mobile_pets' as const },
  { icon: 'map-pin', labelKey: 'shop.addresses', route: 'AddressBook' as const, feature: 'mobile_shop' as const },
  { icon: 'gift', labelKey: 'referral.menu', route: 'Referral' as const, feature: 'referral' as const },
  { icon: 'user', labelKey: 'profile.personalInfo', route: 'ProfileEdit' as const, feature: null },
  { icon: 'bell', labelKey: 'profile.notificationPreferences', route: 'NotificationPreferences' as const, feature: null },
  { icon: 'credit-card', labelKey: 'profile.paymentMethods', route: 'PaymentMethods' as const, feature: null },
  { icon: 'shield', labelKey: 'profile.privacySecurity', route: 'PrivacySecurity' as const, feature: null },
  { icon: 'star', labelKey: 'profile.myReviews', route: 'Reviews' as const, feature: 'mobile_booking' as const },
  { icon: 'phone', labelKey: 'help.title', route: 'HelpSupport' as const, feature: null },
] as const;

export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, biometricEnabled, biometricLabel } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const { bookings, reload } = useMobileBookings();
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const primary = branding?.primaryColor ?? colors.primary;
  const { showBooking, showShop, showPets } = customerAppFeatures(bootstrap?.features);
  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.feature) return true;
    if (item.feature === 'mobile_booking') return showBooking;
    if (item.feature === 'mobile_shop') return showShop;
    if (item.feature === 'mobile_pets') return showPets;
    if (item.feature === 'referral') return Boolean(bootstrap?.referral?.enabled);
    return false;
  });

  const loadLoyalty = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.getLoyalty({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setLoyaltyEnabled(Boolean(res.data.enabled || bootstrap?.loyalty?.enabled));
      setLoyaltyPoints(res.data.enabled ? res.data.points_balance ?? 0 : 0);
    } catch {
      setLoyaltyEnabled(Boolean(bootstrap?.loyalty?.enabled));
      setLoyaltyPoints(0);
    }
  }, [tenantSlug, businessCode, bootstrap?.loyalty?.enabled]);

  useEffect(() => {
    if (bootstrap?.loyalty?.enabled) setLoyaltyEnabled(true);
  }, [bootstrap?.loyalty?.enabled]);

  const loadOrders = useCallback(async () => {
    if (!showShop || !tenantSlug || !businessCode) {
      setOrders([]);
      return;
    }
    try {
      const res = await mobileClient.mobile.listShopOrders({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setOrders(res.data);
    } catch {
      setOrders([]);
    }
  }, [showShop, tenantSlug, businessCode]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reload(), loadLoyalty(), loadOrders()]);
  });
  useFocusEffect(
    useCallback(() => {
      void loadLoyalty();
      void loadOrders();
    }, [loadLoyalty, loadOrders]),
  );

  useEffect(() => {
    void loadLoyalty();
    void loadOrders();
  }, [loadLoyalty, loadOrders]);

  const displayName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Guest';
  const completedBookings = bookings.filter((booking) => booking.status === 'completed').length;
  const stats = [
    ...(showBooking
      ? [
          { label: t('nav.bookings'), value: String(bookings.length) },
          { label: t('profile.completed'), value: String(completedBookings) },
        ]
      : []),
    ...(showShop ? [{ label: t('shop.myOrders'), value: String(orders.length) }] : []),
  ];

  async function onSignOut() {
    Alert.alert(
      t('auth.signOut'),
      biometricEnabled
        ? `You'll return to the login screen. You can sign back in with ${biometricLabel}.`
        : t('auth.signOutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.signOut'),
          style: 'destructive',
          onPress: () => void logout(),
        },
      ],
    );
  }

  return (
    <RefreshableScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={onRefresh}
      primaryColor={primary}
      refreshTintColor={primary}
    >
      <LinearGradient colors={[`${primary}22`, colors.background]} style={[styles.hero, { paddingTop: headerPaddingTop }]}>
        <View style={styles.avatarWrap}>
          <Avatar name={displayName} size="xl" src={user?.profile_photo} />
          <Pressable style={[styles.editBadge, { backgroundColor: primary }]} onPress={() => navigation.navigate('ProfileEdit')}>
            <Feather name="edit-2" size={12} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.stats}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {loyaltyEnabled ? (
        <Pressable
          style={styles.pointsCard}
          onPress={() => (bootstrap?.referral?.enabled ? navigation.navigate('Referral') : undefined)}
        >
          <View style={[styles.pointsIcon, { backgroundColor: `${primary}18` }]}>
            <Feather name="award" size={18} color={primary} />
          </View>
          <View style={styles.pointsBody}>
            <Text style={styles.pointsLabel}>{t('profile.rewardPoints')}</Text>
            <Text style={styles.pointsValue}>{loyaltyPoints} pts</Text>
            <Text style={styles.pointsHint}>
              {bootstrap?.referral?.enabled ? t('referral.homeSubtitle') : t('profile.rewardPointsHint')}
            </Text>
          </View>
          {bootstrap?.referral?.enabled ? (
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          ) : null}
        </Pressable>
      ) : bootstrap?.referral?.enabled ? (
        <Pressable style={styles.pointsCard} onPress={() => navigation.navigate('Referral')}>
          <View style={[styles.pointsIcon, { backgroundColor: `${primary}18` }]}>
            <Feather name="gift" size={18} color={primary} />
          </View>
          <View style={styles.pointsBody}>
            <Text style={styles.pointsLabel}>{t('referral.homeTitle')}</Text>
            <Text style={styles.pointsHint}>{t('referral.homeSubtitle')}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}

      <View style={styles.menu}>
        {visibleMenuItems.map((item) => (
          <Pressable
            key={item.labelKey}
            style={styles.menuRow}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.menuIcon}>
              <Feather name={item.icon} size={16} color={colors.mutedForeground} />
            </View>
            <Text style={styles.menuLabel}>{t(item.labelKey)}</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}

        <Pressable style={[styles.menuRow, styles.signOut]} onPress={onSignOut}>
          <View style={[styles.menuIcon, styles.signOutIcon]}>
            <Feather name="log-out" size={16} color={colors.destructive} />
          </View>
          <Text style={styles.signOutLabel}>{t('auth.signOut')}</Text>
        </Pressable>
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  avatarWrap: { position: 'relative', marginBottom: spacing.md },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: { ...typography.heading, fontSize: 20, color: colors.foreground },
  email: { ...typography.body, color: colors.mutedForeground, marginTop: 2 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { ...typography.heading, fontSize: 18, color: colors.foreground },
  statLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  pointsCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pointsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsBody: { flex: 1 },
  pointsLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  pointsValue: { ...typography.heading, fontSize: 20, color: colors.foreground, marginTop: 2 },
  pointsHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  menu: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { ...typography.body, color: colors.foreground, flex: 1, fontWeight: '500' },
  signOut: { marginTop: spacing.md },
  signOutIcon: { backgroundColor: '#FEE2E2' },
  signOutLabel: { ...typography.body, color: colors.destructive, fontWeight: '600', flex: 1 },
});
