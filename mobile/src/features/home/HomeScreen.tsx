import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileDiscoverService, PlatformAnnouncement, ShopDashboardAd, ShopOrder, ShopProduct } from '@ie-platform/sdk';
import { mobileClient } from '../../api/client';
import { PromoCarousel, openPromoAd } from '../../components/PromoCarousel';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { useMobileNotifications } from '../../hooks/useMobileNotifications';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatTime, isUpcomingBooking, mapBookingStatus } from '../../utils/format';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { customerAppFeatures } from '../../utils/customerFeatures';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type HomeNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function bookingDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { day: '—', month: '', weekday: '', dateLabel: '—' };
  }
  return {
    day: date.toLocaleDateString(undefined, { day: 'numeric' }),
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    dateLabel: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
  };
}

function announcementTone(severity?: string) {
  if (severity === 'warning') return { border: '#F59E0B', bg: '#FFFBEB' };
  if (severity === 'critical' || severity === 'error') return { border: '#DC2626', bg: '#FEF2F2' };
  return { border: '#2563EB', bg: '#EFF6FF' };
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const homeFocused = useIsFocused();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const primary = branding?.primaryColor ?? colors.primary;
  const secondary = branding?.secondaryColor ?? '#1E40AF';
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const appName = bootstrap?.business.display_name ?? branding?.appName ?? 'us';

  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [ads, setAds] = useState<ShopDashboardAd[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const { bookings, loading: bookingsLoading, reload: reloadBookings } = useMobileBookings();
  const { unreadCount, loading: notificationsLoading, reload: reloadNotifications } = useMobileNotifications();
  const displayName = user?.first_name || user?.full_name || 'there';

  const loadCatalog = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setCatalogLoading(true);
    try {
      const [serviceRes, productRes, orderRes, announcementRes, adsRes] = await Promise.allSettled([
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
        mobileClient.mobile.listShopAds({ tenant_slug: tenantSlug, business_code: businessCode }),
      ]);
      setServices(
        serviceRes.status === 'fulfilled' && serviceRes.value ? serviceRes.value.data.services.slice(0, 6) : [],
      );
      setProducts(productRes.status === 'fulfilled' && productRes.value ? productRes.value.data.slice(0, 6) : []);
      setOrders(orderRes.status === 'fulfilled' && orderRes.value ? orderRes.value.data.slice(0, 3) : []);
      setAnnouncements(
        announcementRes.status === 'fulfilled' ? announcementRes.value.data.announcements ?? [] : [],
      );
      setAds(adsRes.status === 'fulfilled' ? adsRes.value.data ?? [] : []);
    } finally {
      setCatalogLoading(false);
    }
  }, [tenantSlug, businessCode, showBooking, showShop]);

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
    }
  }, [tenantSlug, businessCode, bootstrap?.loyalty?.enabled]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reloadBookings(), reloadNotifications(), loadCatalog(), loadLoyalty()]);
  });

  const isRefreshing = refreshing || bookingsLoading || notificationsLoading || catalogLoading;

  useFocusEffect(
    React.useCallback(() => {
      void reloadBookings();
      void reloadNotifications();
      void loadLoyalty();
    }, [reloadBookings, reloadNotifications, loadLoyalty]),
  );

  useEffect(() => {
    void loadCatalog();
    void loadLoyalty();
  }, [loadCatalog, loadLoyalty]);

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((booking) => isUpcomingBooking(booking.status, booking.start_at))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 5),
    [bookings],
  );
  const nextBooking = upcomingBookings[0];
  const moreUpcoming = upcomingBookings.slice(1);
  const nextParts = nextBooking ? bookingDateParts(nextBooking.start_at) : null;

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

  return (
    <View style={styles.root}>
      {homeFocused ? <StatusBar style="light" /> : null}
      <LinearGradient colors={[primary, secondary]} style={[styles.topBar, { paddingTop: headerPaddingTop }]}>
        <Text style={styles.heroName} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.heroActions}>
          {loyaltyEnabled ? (
            <Pressable style={styles.pointsChip} onPress={() => navigation.navigate('Profile')}>
              <Feather name="award" size={14} color="#fff" />
              <Text style={styles.pointsChipText}>{loyaltyPoints} pts</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.bell} onPress={() => navigation.navigate('Alerts')}>
            <Feather name="bell" size={16} color="#fff" />
            {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>
      </LinearGradient>

      <RefreshableScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        <LinearGradient colors={[primary, secondary]} style={styles.hero}>
          {showBooking ? (
            nextBooking ? (
              <Pressable
                style={styles.nextCard}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: nextBooking.id })}
              >
                <Text style={styles.nextLabel}>Next appointment</Text>
                <View style={styles.nextMain}>
                  <View style={styles.nextDateTile}>
                    <Text style={styles.nextDateMonth}>{nextParts?.month}</Text>
                    <Text style={styles.nextDateDay}>{nextParts?.day}</Text>
                  </View>
                  <View style={styles.nextCopy}>
                    <Text style={styles.nextTitle} numberOfLines={2}>
                      {nextBooking.service_name}
                    </Text>
                    <Text style={styles.nextHint}>
                      {nextParts?.dateLabel} · {formatTime(nextBooking.start_at)}
                    </Text>
                    {nextBooking.staff_name ? (
                      <Text style={styles.nextHint}>with {nextBooking.staff_name}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.manageBtn}>
                  <Text style={[styles.manageText, { color: primary }]}>View details</Text>
                  <Feather name="chevron-right" size={14} color={primary} />
                </View>
              </Pressable>
            ) : (
              <Pressable style={styles.nextCard} onPress={() => navigation.navigate('Book')}>
                <Text style={styles.nextLabel}>Next appointment</Text>
                <Text style={styles.nextTitle}>No upcoming bookings</Text>
                <Text style={styles.nextHint}>Book your next visit in a few taps</Text>
                <View style={styles.manageBtn}>
                  <Text style={[styles.manageText, { color: primary }]}>Book now</Text>
                  <Feather name="chevron-right" size={14} color={primary} />
                </View>
              </Pressable>
            )
          ) : showShop ? (
            <Pressable style={styles.nextCard} onPress={() => navigation.navigate('Shop')}>
              <Text style={styles.nextLabel}>Shop {appName}</Text>
              <Text style={styles.nextTitle}>Order in a few taps</Text>
              <Text style={styles.nextHint}>Browse products and keep your receipts in the app</Text>
              <View style={styles.manageBtn}>
                <Text style={[styles.manageText, { color: primary }]}>Shop now</Text>
                <Feather name="chevron-right" size={14} color={primary} />
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.nextCard} onPress={() => navigation.navigate('HelpSupport')}>
              <Text style={styles.nextLabel}>Welcome</Text>
              <Text style={styles.nextTitle}>{appName}</Text>
              <Text style={styles.nextHint}>Reach the team any time from Help & Support</Text>
              <View style={styles.manageBtn}>
                <Text style={[styles.manageText, { color: primary }]}>Get help</Text>
                <Feather name="chevron-right" size={14} color={primary} />
              </View>
            </Pressable>
          )}
        </LinearGradient>

        <PromoCarousel
          ads={ads}
          playing={homeFocused}
          fallbackColors={[primary, secondary]}
          ctaLabel={showShop ? 'Shop now' : 'Learn more'}
          onPressAd={(ad) =>
            openPromoAd(ad, (screen, params) => navigation.navigate(screen as never, params as never), showShop)
          }
        />

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

        {showBooking && moreUpcoming.length ? (
          <>
            <SectionHeader
              title="Also coming up"
              action={
                <Pressable onPress={() => navigation.navigate('BookingHistory')}>
                  <Text style={[styles.link, { color: primary }]}>See all</Text>
                </Pressable>
              }
            />
            <View style={styles.upcomingList}>
              {moreUpcoming.map((booking) => {
                const parts = bookingDateParts(booking.start_at);
                return (
                  <Pressable
                    key={booking.id}
                    style={styles.upcomingCard}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                  >
                    <View style={[styles.upcomingDate, { backgroundColor: `${primary}12` }]}>
                      <Text style={[styles.upcomingMonth, { color: primary }]}>{parts.month}</Text>
                      <Text style={[styles.upcomingDay, { color: primary }]}>{parts.day}</Text>
                    </View>
                    <View style={styles.sampleBody}>
                      <Text style={styles.sampleTitle} numberOfLines={1}>
                        {booking.service_name}
                      </Text>
                      <Text style={styles.sampleMeta}>
                        {parts.weekday} · {formatTime(booking.start_at)}
                        {booking.staff_name ? ` · ${booking.staff_name}` : ''}
                      </Text>
                    </View>
                    <Badge status={mapBookingStatus(booking.status)} />
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

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
                      <Feather name="calendar" size={18} color={primary} />
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
                        <Feather name="calendar" size={16} color={colors.mutedForeground} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pointsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  pointsChipText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  heroName: { ...typography.heading, color: '#fff', flex: 1, fontSize: 20 },
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
    gap: spacing.md,
  },
  nextLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.4 },
  nextMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nextDateTile: {
    width: 56,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  nextDateMonth: { ...typography.tiny, color: 'rgba(255,255,255,0.75)', fontWeight: '800', letterSpacing: 0.6 },
  nextDateDay: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  nextCopy: { flex: 1, gap: 4 },
  nextTitle: { ...typography.title, color: '#fff' },
  nextHint: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  manageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manageText: { ...typography.caption, fontWeight: '700' },
  upcomingList: { gap: spacing.sm, marginBottom: spacing.xl },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upcomingDate: {
    width: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  upcomingMonth: { ...typography.tiny, fontWeight: '800', letterSpacing: 0.5 },
  upcomingDay: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  announceList: { gap: spacing.sm, marginBottom: spacing.xl },
  announceCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  announceTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  announceBody: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
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
