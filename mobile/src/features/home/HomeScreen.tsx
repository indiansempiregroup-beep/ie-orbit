import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileDiscoverService, PlatformAnnouncement, ShopOrder, ShopProduct } from '@ie-platform/sdk';
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
import { customerAppFeatures } from '../../utils/customerFeatures';
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

function announcementTone(severity?: string) {
  if (severity === 'warning') return { border: '#F59E0B', bg: '#FFFBEB' };
  if (severity === 'critical' || severity === 'error') return { border: '#DC2626', bg: '#FEF2F2' };
  return { border: '#2563EB', bg: '#EFF6FF' };
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;
  const secondary = branding?.secondaryColor ?? '#1E40AF';
  const { showBooking, showShop, showPets } = customerAppFeatures(bootstrap?.features);
  const appName = bootstrap?.business.display_name ?? branding?.appName ?? 'us';

  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const { bookings, loading: bookingsLoading, reload: reloadBookings } = useMobileBookings();
  const { unreadCount, loading: notificationsLoading, reload: reloadNotifications } = useMobileNotifications();
  const displayName = user?.first_name || user?.full_name || 'there';

  const loadCatalog = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setCatalogLoading(true);
    try {
      const [serviceRes, productRes, orderRes, announcementRes] = await Promise.allSettled([
        showBooking
          ? mobileClient.mobile.discoverServices({ tenant_slug: tenantSlug, business_code: businessCode })
          : Promise.resolve(null),
        showShop
          ? mobileClient.mobile.listShopProducts({ tenant_slug: tenantSlug, business_code: businessCode })
          : Promise.resolve(null),
        showShop
          ? mobileClient.mobile.listShopOrders({ tenant_slug: tenantSlug, business_code: businessCode })
          : Promise.resolve(null),
        mobileClient.help.activeAnnouncements(),
      ]);
      setServices(
        serviceRes.status === 'fulfilled' && serviceRes.value ? serviceRes.value.data.services.slice(0, 6) : [],
      );
      setProducts(productRes.status === 'fulfilled' && productRes.value ? productRes.value.data.slice(0, 6) : []);
      setOrders(orderRes.status === 'fulfilled' && orderRes.value ? orderRes.value.data.slice(0, 3) : []);
      setAnnouncements(
        announcementRes.status === 'fulfilled' ? announcementRes.value.data.announcements ?? [] : [],
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [tenantSlug, businessCode, showBooking, showShop]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reloadBookings(), reloadNotifications(), loadCatalog()]);
  });

  const isRefreshing = refreshing || bookingsLoading || notificationsLoading || catalogLoading;

  useFocusEffect(
    React.useCallback(() => {
      void reloadBookings();
      void reloadNotifications();
    }, [reloadBookings, reloadNotifications]),
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

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

  const featuredServices = useMemo(() => services.slice(0, 3), [services]);
  const featuredProducts = useMemo(() => products.slice(0, 3), [products]);

  const aboutSubtitle = showBooking && showShop
    ? 'Bookings, shopping, and support in one place'
    : showShop
      ? 'Your neighborhood shop, in your pocket'
      : 'Your trusted booking partner';

  const quickActions = [
    showBooking
      ? { key: 'book', icon: 'calendar' as const, label: 'Book', onPress: () => navigation.navigate('Book') }
      : null,
    showShop
      ? { key: 'shop', icon: 'shopping-bag' as const, label: 'Shop', onPress: () => navigation.navigate('Shop') }
      : null,
    showPets
      ? { key: 'pets', icon: 'heart' as const, label: 'Pets', onPress: () => navigation.navigate('MyPets') }
      : null,
    showBooking
      ? { key: 'history', icon: 'clock' as const, label: 'History', onPress: () => navigation.navigate('BookingHistory') }
      : showShop
        ? { key: 'orders', icon: 'package' as const, label: 'Orders', onPress: () => navigation.navigate('ShopOrderHistory') }
        : null,
    { key: 'alerts', icon: 'bell' as const, label: 'Alerts', onPress: () => navigation.navigate('Alerts') },
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);

  return (
    <RefreshableScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      primaryColor={primary}
    >
      <LinearGradient colors={[primary, secondary]} style={styles.hero}>
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
          {showBooking ? (
            nextBooking ? (
              <>
                <Text style={styles.nextLabel}>Next appointment</Text>
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
                    <Text style={styles.nextMetaText}>{formatTime(nextBooking.start_at)}</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.manageBtn}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: nextBooking.id })}
                >
                  <Text style={[styles.manageText, { color: primary }]}>Manage</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.nextLabel}>Next appointment</Text>
                <Text style={styles.nextTitle}>No upcoming bookings</Text>
                <Text style={styles.nextHint}>Book your next visit in seconds</Text>
                <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('Book')}>
                  <Text style={[styles.manageText, { color: primary }]}>Book now</Text>
                </Pressable>
              </>
            )
          ) : showShop ? (
            <>
              <Text style={styles.nextLabel}>Shop {appName}</Text>
              <Text style={styles.nextTitle}>Order in a few taps</Text>
              <Text style={styles.nextHint}>Browse products and keep your receipts in the app</Text>
              <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('Shop')}>
                <Text style={[styles.manageText, { color: primary }]}>Shop now</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.nextLabel}>Welcome</Text>
              <Text style={styles.nextTitle}>{appName}</Text>
              <Text style={styles.nextHint}>Reach the team any time from Help & Support</Text>
              <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('HelpSupport')}>
                <Text style={[styles.manageText, { color: primary }]}>Get help</Text>
              </Pressable>
            </>
          )}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {announcements.length ? (
          <View style={styles.announceList}>
            {announcements.slice(0, 2).map((item) => {
              const tone = announcementTone(item.severity);
              return (
                <View key={item.id} style={[styles.announceCard, { borderColor: tone.border, backgroundColor: tone.bg }]}>
                  <Text style={styles.announceTitle}>{item.title}</Text>
                  {item.message ? <Text style={styles.announceBody}>{item.message}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <Pressable key={action.key} style={styles.quickCard} onPress={action.onPress}>
              <View style={[styles.quickIcon, { backgroundColor: `${primary}14` }]}>
                <Feather name={action.icon} size={20} color={primary} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {showBooking ? (
          <>
            <SectionHeader
              title="Popular services"
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
              {featuredServices.map((service) => (
                <Pressable
                  key={service.id}
                  style={styles.serviceCard}
                  onPress={() => navigation.navigate('Book', { serviceId: service.id })}
                >
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
              {!featuredServices.length ? (
                <View style={styles.serviceCard}>
                  <Text style={styles.serviceMeta}>Services will appear here once loaded.</Text>
                </View>
              ) : null}
            </ScrollView>
          </>
        ) : null}

        {showShop ? (
          <>
            <SectionHeader
              title="Featured products"
              action={
                <Pressable onPress={() => navigation.navigate('Shop')}>
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
              {featuredProducts.map((product) => (
                <Pressable
                  key={product.id}
                  style={styles.serviceCard}
                  onPress={() => navigation.navigate('ShopProductDetail', { productId: product.id })}
                >
                  {product.image_url ? (
                    <Image source={{ uri: resolveMediaUrl(product.image_url) }} style={styles.serviceImage} />
                  ) : (
                    <View style={[styles.serviceIcon, { backgroundColor: `${primary}12` }]}>
                      <Feather name="shopping-bag" size={18} color={primary} />
                    </View>
                  )}
                  <Text style={styles.serviceName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.serviceMeta}>
                    {product.currency ?? ''} {product.price}
                  </Text>
                </Pressable>
              ))}
              {!featuredProducts.length ? (
                <View style={styles.serviceCard}>
                  <Text style={styles.serviceMeta}>Products will appear here once loaded.</Text>
                </View>
              ) : null}
            </ScrollView>
          </>
        ) : null}

        <SectionHeader title="About" />
        <View style={styles.aboutCard}>
          <Avatar name={appName} size="md" src={branding?.logo} />
          <View style={styles.aboutText}>
            <Text style={styles.aboutTitle}>{appName}</Text>
            <Text style={styles.aboutSubtitle}>{aboutSubtitle}</Text>
          </View>
        </View>

        {showBooking ? (
          <>
            <SectionHeader title="Recent appointments" />
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
          </>
        ) : null}

        {showShop ? (
          <>
            <SectionHeader title="Recent orders" />
            {orders.length ? (
              <View style={styles.historyList}>
                {orders.map((order) => (
                  <Pressable
                    key={order.id}
                    onPress={() => navigation.navigate('ShopOrderDetail', { orderId: order.id })}
                  >
                    <View style={styles.sampleRow}>
                      <View style={styles.sampleIcon}>
                        <Feather name="package" size={16} color={colors.mutedForeground} />
                      </View>
                      <View style={styles.sampleBody}>
                        <Text style={styles.sampleTitle}>{order.order_number}</Text>
                        <Text style={styles.sampleMeta}>
                          {order.currency ?? ''} {order.total}
                          {order.created_at ? ` · ${new Date(order.created_at).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.sampleMeta}>{order.status}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.emptyHistory}>
                <Feather name="shopping-bag" size={20} color={colors.mutedForeground} />
                <Text style={styles.emptyText}>Your orders will show up here after your first purchase.</Text>
              </View>
            )}
          </>
        ) : null}
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
  announceList: { gap: spacing.sm, marginBottom: spacing.xl },
  announceCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  announceTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  announceBody: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xxxl },
  quickCard: {
    flexGrow: 1,
    flexBasis: 72,
    minWidth: 72,
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
  historyList: { gap: spacing.md, marginBottom: spacing.xl },
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
