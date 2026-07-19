import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileDiscoverService } from '@ie-platform/sdk';
import { mobileClient } from '../../api/client';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { useMobileNotifications } from '../../hooks/useMobileNotifications';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatTime, isUpcomingBooking, mapBookingStatus } from '../../utils/format';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type HomeNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;

  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const { bookings, loading: bookingsLoading, reload: reloadBookings } = useMobileBookings();
  const { unreadCount, loading: notificationsLoading, reload: reloadNotifications } = useMobileNotifications();
  const displayName = user?.first_name || user?.full_name || 'there';

  const loadServices = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setServicesLoading(true);
    try {
      const res = await mobileClient.mobile.discoverServices({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setServices(res.data.services.slice(0, 6));
    } catch {
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, [tenantSlug, businessCode]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reloadBookings(), reloadNotifications(), loadServices()]);
  });

  const isRefreshing = refreshing || bookingsLoading || notificationsLoading || servicesLoading;

  useFocusEffect(
    React.useCallback(() => {
      void reloadBookings();
      void reloadNotifications();
    }, [reloadBookings, reloadNotifications]),
  );

  useEffect(() => {
    void loadServices().catch(() => setServices([]));
  }, [loadServices]);

  const nextBooking = useMemo(
    () => bookings.find((booking) => isUpcomingBooking(booking.status, booking.start_at)),
    [bookings],
  );

  const recentBookings = useMemo(
    () =>
      bookings
        .filter((booking) => !isUpcomingBooking(booking.status, booking.start_at))
        .slice(0, 3),
    [bookings],
  );

  const featured = useMemo(() => services.slice(0, 3), [services]);

  return (
    <RefreshableScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      primaryColor={primary}
    >
      <LinearGradient colors={[primary, '#1E40AF']} style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>{greeting()},</Text>
            <Text style={styles.heroName}>{displayName} 👋</Text>
          </View>
          <Pressable style={styles.bell} onPress={() => navigation.navigate('Alerts')}>
            <Feather name="bell" size={16} color="#fff" />
            {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>

        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Next Appointment</Text>
          {nextBooking ? (
            <>
              <Text style={styles.nextTitle}>{nextBooking.service_name}</Text>
              {nextBooking.staff_name ? (
                <Text style={styles.nextHint}>with {nextBooking.staff_name}</Text>
              ) : null}
              <View style={styles.nextMetaRow}>
                <View style={styles.nextMetaItem}>
                  <Feather name="calendar" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.nextMetaText}>{new Date(nextBooking.start_at).toLocaleDateString()}</Text>
                </View>
                <View style={styles.nextMetaItem}>
                  <Feather name="clock" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.nextMetaText}>
                    {formatTime(nextBooking.start_at)}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.manageBtn}
                onPress={() =>
                  nextBooking
                    ? navigation.navigate('BookingDetail', { bookingId: nextBooking.id })
                    : navigation.navigate('Book')
                }
              >
                <Text style={[styles.manageText, { color: primary }]}>
                  {nextBooking ? 'Manage' : 'Book now'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.nextTitle}>No upcoming bookings</Text>
              <Text style={styles.nextHint}>Book your next visit in seconds</Text>
              <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('Book')}>
                <Text style={[styles.manageText, { color: primary }]}>Book now</Text>
              </Pressable>
            </>
          )}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.quickActions}>
          <Pressable style={styles.quickCard} onPress={() => navigation.navigate('Book')}>
            <View style={[styles.quickIcon, { backgroundColor: `${primary}14` }]}>
              <Feather name="calendar" size={20} color={primary} />
            </View>
            <Text style={styles.quickLabel}>Book</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => navigation.navigate('BookingHistory')}>
            <View style={[styles.quickIcon, { backgroundColor: `${primary}14` }]}>
              <Feather name="clock" size={20} color={primary} />
            </View>
            <Text style={styles.quickLabel}>History</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => navigation.navigate('Alerts')}>
            <View style={[styles.quickIcon, { backgroundColor: `${primary}14` }]}>
              <Feather name="bell" size={20} color={primary} />
            </View>
            <Text style={styles.quickLabel}>Alerts</Text>
          </Pressable>
        </View>

        <SectionHeader
          title="Popular Services"
          action={
            <Pressable onPress={() => navigation.navigate('Discover')}>
              <Text style={[styles.link, { color: primary }]}>See all</Text>
            </Pressable>
          }
        />

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.serviceRow}
        >
          {featured.map((service) => (
            <Pressable key={service.id} style={styles.serviceCard} onPress={() => navigation.navigate('Book', { serviceId: service.id })}>
              {service.image_url ? (
                <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.serviceImage} />
              ) : (
                <View style={[styles.serviceIcon, { backgroundColor: `${primary}12` }]}>
                  <Feather name="scissors" size={18} color={primary} />
                </View>
              )}
              <Text style={styles.serviceName} numberOfLines={2}>
                {service.name}
              </Text>
              <Text style={styles.serviceMeta}>
                {service.duration_minutes} min · {service.currency} {service.price}
              </Text>
            </Pressable>
          ))}
          {!featured.length ? (
            <View style={styles.serviceCard}>
              <Text style={styles.serviceMeta}>Services will appear here once loaded.</Text>
            </View>
          ) : null}
        </ScrollView>

        <SectionHeader title="About" />
        <View style={styles.aboutCard}>
          <Avatar name={bootstrap?.business.display_name ?? branding?.appName ?? 'Salon'} size="md" src={branding?.logo} />
          <View style={styles.aboutText}>
            <Text style={styles.aboutTitle}>{bootstrap?.business.display_name ?? branding?.appName}</Text>
            <Text style={styles.aboutSubtitle}>Your trusted booking partner</Text>
          </View>
        </View>

        <SectionHeader title="Recent Appointments" />
        {recentBookings.length ? (
          <View style={styles.historyList}>
            {recentBookings.map((booking) => (
              <Pressable
                key={booking.id}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
              >
                <View style={styles.sampleRow}>
                <View style={styles.sampleIcon}>
                  <Feather name="scissors" size={16} color={colors.mutedForeground} />
                </View>
                <View style={styles.sampleBody}>
                  <Text style={styles.sampleTitle}>{booking.service_name}</Text>
                  <Text style={styles.sampleMeta}>
                    {new Date(booking.start_at).toLocaleDateString()} · #{booking.booking_number}
                  </Text>
                </View>
                <Badge status={mapBookingStatus(booking.status)} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistory}>
            <Feather name="calendar" size={20} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>Your appointment history will show up here after your first booking.</Text>
          </View>
        )}
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl },
  hero: { paddingTop: 56, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xxl },
  heroGreeting: { ...typography.body, color: 'rgba(255,255,255,0.7)' },
  heroName: { ...typography.heading, color: '#fff', marginTop: 2 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.destructive,
    borderWidth: 1,
    borderColor: '#fff',
  },
  nextCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  nextLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  nextTitle: { ...typography.title, color: '#fff' },
  nextHint: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: spacing.sm },
  nextMetaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  nextMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextMetaText: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  manageBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  manageText: { ...typography.caption, fontWeight: '700' },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  quickActions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xxxl },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  quickIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  link: { ...typography.caption, fontWeight: '600' },
  serviceRow: { gap: spacing.md, paddingBottom: spacing.sm },
  serviceCard: {
    width: 150,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  serviceIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  serviceImage: { width: '100%', height: 72, borderRadius: radius.md, marginBottom: spacing.sm },
  serviceName: { ...typography.label, color: colors.foreground },
  serviceMeta: { ...typography.caption, color: colors.mutedForeground },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xxxl,
  },
  aboutText: { flex: 1 },
  aboutTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  aboutSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  emptyHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  historyList: { gap: spacing.md },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sampleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleBody: { flex: 1 },
  sampleTitle: { ...typography.label, color: colors.foreground },
  sampleMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
