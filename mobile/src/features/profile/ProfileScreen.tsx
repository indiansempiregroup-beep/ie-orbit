import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  { icon: 'calendar', label: 'My Appointments', route: 'BookingHistory' as const },
  { icon: 'user', label: 'Personal Information', route: 'ProfileEdit' as const },
  { icon: 'bell', label: 'Notification Preferences', route: 'NotificationPreferences' as const },
  { icon: 'credit-card', label: 'Payment Methods', route: 'PaymentMethods' as const },
  { icon: 'shield', label: 'Privacy & Security', route: 'PrivacySecurity' as const },
  { icon: 'star', label: 'My Reviews', route: 'Reviews' as const },
  { icon: 'phone', label: 'Help & Support', route: 'HelpSupport' as const },
] as const;

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, biometricEnabled, biometricLabel } = useAuth();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { bookings, loading, reload } = useMobileBookings();
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const primary = branding?.primaryColor ?? colors.primary;

  const loadLoyalty = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.getLoyalty({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setLoyaltyPoints(res.data.points_balance ?? 0);
    } catch {
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
      'Sign out',
      biometricEnabled
        ? `You'll return to the login screen. You can sign back in with ${biometricLabel}.`
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
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
            { label: 'Bookings', value: String(bookings.length) },
            { label: 'Completed', value: String(completedBookings) },
            { label: 'Loyalty Pts', value: String(loyaltyPoints) },
          ].map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.menu}>
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            style={styles.menuRow}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.menuIcon}>
              <Feather name={item.icon} size={16} color={colors.mutedForeground} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}

        <Pressable style={[styles.menuRow, styles.signOut]} onPress={onSignOut}>
          <View style={[styles.menuIcon, styles.signOutIcon]}>
            <Feather name="log-out" size={16} color={colors.destructive} />
          </View>
          <Text style={styles.signOutLabel}>Sign out</Text>
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
