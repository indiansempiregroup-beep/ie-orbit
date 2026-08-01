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
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const menuItems = [
  { icon: 'calendar', labelKey: 'bookings.myAppointments', route: 'BookingHistory' as const, feature: null },
  { icon: 'shopping-bag', labelKey: 'shop.myOrders', route: 'ShopOrderHistory' as const, feature: 'mobile_shop' as const },
  { icon: 'rotate-ccw', labelKey: 'shop.returns', route: 'MyReturns' as const, feature: 'mobile_shop' as const },
  { icon: 'heart', labelKey: 'shop.myPets', route: 'MyPets' as const, feature: 'mobile_pets' as const },
  { icon: 'map-pin', labelKey: 'shop.addresses', route: 'AddressBook' as const, feature: 'mobile_shop' as const },
  { icon: 'user', labelKey: 'profile.personalInfo', route: 'ProfileEdit' as const, feature: null },
  { icon: 'bell', labelKey: 'profile.notificationPreferences', route: 'NotificationPreferences' as const, feature: null },
  { icon: 'credit-card', labelKey: 'profile.paymentMethods', route: 'PaymentMethods' as const, feature: null },
  { icon: 'shield', labelKey: 'profile.privacySecurity', route: 'PrivacySecurity' as const, feature: null },
  { icon: 'star', labelKey: 'profile.myReviews', route: 'Reviews' as const, feature: null },
  { icon: 'phone', labelKey: 'help.title', route: 'HelpSupport' as const, feature: null },
] as const;

export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, biometricEnabled, biometricLabel } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { bookings, loading, reload } = useMobileBookings();
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const primary = branding?.primaryColor ?? colors.primary;
  const features = bootstrap?.features ?? {};
  const visibleMenuItems = menuItems.filter((item) => !item.feature || Boolean(features[item.feature]));

  const loadLoyalty = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.getLoyalty({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setLoyaltyEnabled(Boolean(res.data.enabled));
      setLoyaltyPoints(res.data.enabled ? res.data.points_balance ?? 0 : 0);
    } catch {
      setLoyaltyEnabled(false);
      setLoyaltyPoints(0);
    }
  }, [tenantSlug, businessCode]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reload(), loadLoyalty()]);
  });
  const isRefreshing = refreshing || loading;

  useFocusEffect(
    useCallback(() => {
      void loadLoyalty();
    }, [loadLoyalty]),
  );

  useEffect(() => {
    void loadLoyalty();
  }, [loadLoyalty]);

  const displayName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Guest';
  const completedBookings = bookings.filter((booking) => booking.status === 'completed').length;

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
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      primaryColor={primary}
      refreshTintColor={primary}
    >
      <LinearGradient colors={[`${primary}22`, colors.background]} style={styles.hero}>
        <View style={styles.avatarWrap}>
          <Avatar name={displayName} size="xl" src={user?.profile_photo} />
          <Pressable style={[styles.editBadge, { backgroundColor: primary }]} onPress={() => navigation.navigate('ProfileEdit')}>
            <Feather name="edit-2" size={12} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.stats}>
          {[
            { label: t('nav.bookings'), value: String(bookings.length) },
            { label: t('profile.completed'), value: String(completedBookings) },
            ...(loyaltyEnabled ? [{ label: t('profile.loyaltyPts'), value: String(loyaltyPoints) }] : []),
          ].map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

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
  hero: { alignItems: 'center', paddingTop: 56, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
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
  stats: { flexDirection: 'row', gap: spacing.xxxl, marginTop: spacing.xl },
  stat: { alignItems: 'center' },
  statValue: { ...typography.heading, fontSize: 18, color: colors.foreground },
  statLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
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
