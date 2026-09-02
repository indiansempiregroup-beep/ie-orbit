import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileDiscoverService, PlatformAnnouncement, ShopDashboardAd, ShopOrder, ShopProduct } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { PromoCarousel, openPromoAd } from '../../components/PromoCarousel';
import { HomeBookingRow } from '../../components/HomeBookingRow';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { useMobileNotifications } from '../../hooks/useMobileNotifications';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Avatar } from '../../components/ui/Avatar';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useScreenInsets, useTabBarLayout } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { isUpcomingBooking, mapBookingStatus } from '../../utils/format';
import {
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStartsInLabel,
  bookingTimeRangeLabel,
} from '../../utils/bookingDisplay';
import {
  formatShopMoney,
  formatShopOrderPlaced,
  isShopOrderUnpaid,
  shopOrderDeliverySummary,
  shopOrderHeadline,
  shopOrderStatusColors,
} from '../shop/shopHelpers';
import { DeliveryProgressStepper } from '../shop/DeliveryProgressStepper';
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

function orderTimestamp(order: ShopOrder) {
  if (!order.created_at) return 0;
  const ts = new Date(order.created_at).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

/** Prefer summed quantities so "3 items" matches what the customer actually bought. */
function orderItemCount(order: ShopOrder) {
  const lines = order.lines ?? [];
  const quantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  return quantity > 0 ? quantity : lines.length;
}

function announcementTone(severity?: string) {
  if (severity === 'warning') return { border: '#F59E0B', bg: '#FFFBEB' };
  if (severity === 'critical' || severity === 'error') return { border: '#DC2626', bg: '#FEF2F2' };
  return { border: '#2563EB', bg: '#EFF6FF' };
}

/** Placeholder rows so the section never flashes "nothing here" while the first load runs. */
function HistorySkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <View style={[styles.historyList, styles.sectionGap]}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.historyCard}>
          <View style={styles.skeletonIcon} />
          <View style={styles.sampleBody}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const homeFocused = useIsFocused();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const { contentInset } = useTabBarLayout();
  const primary = branding?.primaryColor ?? colors.primary;
  const secondary = branding?.secondaryColor ?? '#1E40AF';
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const appName = bootstrap?.business.display_name ?? branding?.appName ?? 'us';

  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const activeDeliveryOrder = useMemo(
    () => orders.find((order) => shopOrderDeliverySummary(order)?.active),
    [orders],
  );
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [ads, setAds] = useState<ShopDashboardAd[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const { bookings, loading: bookingsLoading, reload: reloadBookings } = useMobileBookings();
  const { unreadCount, reload: reloadNotifications } = useMobileNotifications();
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
      const orderList = orderRes.status === 'fulfilled' && orderRes.value ? orderRes.value.data : [];
      setOrders([...orderList].sort((a, b) => orderTimestamp(b) - orderTimestamp(a)).slice(0, 3));
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
        .filter((booking) => isUpcomingBooking(booking.status, booking.start_at, booking.end_at))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 5),
    [bookings],
  );
  const nextBooking = upcomingBookings[0];
  const moreUpcoming = upcomingBookings.slice(1);
  const nextParts = nextBooking ? bookingDateParts(nextBooking.start_at) : null;
  const nextTiming = nextBooking ? bookingStartsInLabel(nextBooking.start_at, nextBooking.end_at) : null;
  const nextStaffLabel = nextBooking ? bookingStaffLabel(nextBooking) : '';

  const recentBookings = useMemo(
    () =>
      bookings
        .filter((booking) => !isUpcomingBooking(booking.status, booking.start_at, booking.end_at))
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
        .slice(0, 3),
    [bookings],
  );

  const rebookTarget = useMemo(
    () => recentBookings.find((booking) => mapBookingStatus(booking.status) === 'completed') ?? recentBookings[0],
    [recentBookings],
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
        contentContainerStyle={{ paddingBottom: contentInset }}
        refreshing={refreshing}
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
                <View style={styles.nextHeaderRow}>
                  <Text style={styles.nextLabel}>Next appointment</Text>
                  {nextTiming ? (
                    <View style={styles.nextTimingChip}>
                      <Feather
                        name={nextTiming.tone === 'now' ? 'activity' : 'clock'}
                        size={12}
                        color="#fff"
                      />
                      <Text style={styles.nextTimingText}>{nextTiming.label}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.nextMain}>
                  <View style={styles.nextDateTile}>
                    <Text style={styles.nextDateMonth}>{nextParts?.month}</Text>
                    <Text style={styles.nextDateDay}>{nextParts?.day}</Text>
                  </View>
                  <View style={styles.nextCopy}>
                    <Text style={styles.nextTitle} numberOfLines={2}>
                      {bookingServiceLabel(nextBooking)}
                    </Text>
                    <Text style={styles.nextHint}>
                      {bookingTimeRangeLabel(nextBooking.start_at, nextBooking.end_at)}
                      {nextBooking.duration_minutes ? ` · ${nextBooking.duration_minutes} min` : ''}
                    </Text>
                    {nextBooking.branch?.display_name ? (
                      <Text style={styles.nextHint} numberOfLines={1}>
                        at {nextBooking.branch.display_name}
                      </Text>
                    ) : null}
                    {nextStaffLabel ? (
                      <Text style={styles.nextHint} numberOfLines={2}>
                        with {nextStaffLabel}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
                </View>
              </Pressable>
            ) : (
              <Pressable style={styles.nextCard} onPress={() => navigation.navigate('Book')}>
                <Text style={styles.nextLabel}>Next appointment</Text>
                <View style={styles.nextMain}>
                  <View style={styles.nextCopy}>
                    <Text style={styles.nextTitle}>No upcoming bookings</Text>
                    <Text style={styles.nextHint}>Book your next visit in a few taps</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
                </View>
              </Pressable>
            )
          ) : showShop ? (
            <Pressable style={styles.nextCard} onPress={() => navigation.navigate('Shop')}>
              <Text style={styles.nextLabel}>Shop {appName}</Text>
              <View style={styles.nextMain}>
                <View style={styles.nextCopy}>
                  <Text style={styles.nextTitle}>Order in a few taps</Text>
                  <Text style={styles.nextHint}>Browse products and keep your receipts in the app</Text>
                </View>
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.nextCard} onPress={() => navigation.navigate('HelpSupport')}>
              <Text style={styles.nextLabel}>Welcome</Text>
              <View style={styles.nextMain}>
                <View style={styles.nextCopy}>
                  <Text style={styles.nextTitle}>{appName}</Text>
                  <Text style={styles.nextHint}>Reach the team any time from Help & Support</Text>
                </View>
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
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
            openPromoAd(
              ad,
              (screen, params) =>
                (navigation.navigate as unknown as (name: string, params?: object) => void)(screen, params),
              showShop,
            )
          }
        />

        {bootstrap?.referral?.enabled ? (
          <Pressable style={styles.inviteCard} onPress={() => navigation.navigate('Referral')}>
            <View style={[styles.inviteIcon, { backgroundColor: `${primary}18` }]}>
              <Feather name="gift" size={18} color={primary} />
            </View>
            <View style={styles.inviteBody}>
              <Text style={styles.inviteTitle}>Invite a friend</Text>
              <Text style={styles.inviteSubtitle}>
                Share your code and earn {bootstrap.referral.points_per_referral} reward points
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}

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
              {moreUpcoming.map((booking) => (
                <HomeBookingRow
                  key={booking.id}
                  booking={booking}
                  variant="upcoming"
                  primaryColor={primary}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                />
              ))}
            </View>
          </>
        ) : null}

        {showBooking ? (
          <>
            <SectionHeader
              title="Popular services"
              action={
                <Pressable onPress={() => navigation.navigate('Services')}>
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
                  <Text style={styles.serviceMeta}>
                    {catalogLoading ? 'Loading services...' : 'Services will appear here once loaded.'}
                  </Text>
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
                  <Text style={styles.serviceMeta}>
                    {catalogLoading ? 'Loading products...' : 'Products will appear here once loaded.'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </>
        ) : null}

        {showBooking ? (
          <>
            <SectionHeader
              title="Recent appointments"
              action={
                recentBookings.length ? (
                  <Pressable onPress={() => navigation.navigate('BookingHistory')} hitSlop={8}>
                    <Text style={[styles.link, { color: primary }]}>See all</Text>
                  </Pressable>
                ) : undefined
              }
            />
            {bookingsLoading && !bookings.length ? (
              <HistorySkeleton />
            ) : recentBookings.length ? (
              <View style={styles.historyBlock}>
                <View style={styles.historyList}>
                  {recentBookings.map((booking) => (
                    <HomeBookingRow
                      key={booking.id}
                      booking={booking}
                      variant="recent"
                      primaryColor={primary}
                      onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                    />
                  ))}
                </View>
                {rebookTarget ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.repeatBtn,
                      { borderColor: `${primary}40`, backgroundColor: `${primary}0D` },
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() => navigation.navigate('Book', { serviceId: rebookTarget.service_id })}
                  >
                    <Feather name="rotate-ccw" size={14} color={primary} />
                    <Text style={[styles.repeatText, { color: primary }]} numberOfLines={1}>
                      Book {rebookTarget.service_name} again
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={[styles.emptyIcon, { backgroundColor: `${primary}12` }]}>
                  <Feather name="calendar" size={18} color={primary} />
                </View>
                <Text style={styles.emptyTitle}>{nextBooking ? 'No past visits yet' : 'No past appointments'}</Text>
                <Text style={styles.emptyText}>
                  {nextBooking
                    ? 'Once your upcoming appointment is done, it will appear here for easy rebooking.'
                    : 'Visit us once and your history lands here, so you can rebook in a tap.'}
                </Text>
                {!nextBooking ? (
                  <Pressable
                    style={[styles.emptyCta, { backgroundColor: primary }]}
                    onPress={() => navigation.navigate('Book')}
                  >
                    <Text style={styles.emptyCtaText}>Book your first visit</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </>
        ) : null}

        {showShop ? (
          <>
            {activeDeliveryOrder ? (
              <Pressable
                style={[styles.activeShipmentCard, styles.sectionGap]}
                onPress={() =>
                  navigation.navigate('ShopOrderDetail', { orderId: activeDeliveryOrder.id })
                }
              >
                <View style={styles.activeShipmentHead}>
                  <Text style={[styles.activeShipmentEyebrow, { color: primary }]}>ACTIVE DELIVERY</Text>
                  <Text style={[styles.trackAction, { color: primary }]}>Track</Text>
                </View>
                <Text style={styles.activeShipmentTitle}>
                  Order #{activeDeliveryOrder.order_number}
                </Text>
                <Text style={styles.sampleMeta}>
                  {shopOrderDeliverySummary(activeDeliveryOrder)?.statusLabel}
                  {shopOrderDeliverySummary(activeDeliveryOrder)?.etaLabel
                    ? ` · ${shopOrderDeliverySummary(activeDeliveryOrder)?.etaLabel}`
                    : ''}
                </Text>
                <DeliveryProgressStepper order={activeDeliveryOrder} primary={primary} compact />
              </Pressable>
            ) : null}
            <SectionHeader
              title="Recent orders"
              action={
                orders.length ? (
                  <Pressable onPress={() => navigation.navigate('ShopOrderHistory')} hitSlop={8}>
                    <Text style={[styles.link, { color: primary }]}>See all</Text>
                  </Pressable>
                ) : undefined
              }
            />
            {catalogLoading && !orders.length ? (
              <HistorySkeleton />
            ) : orders.length ? (
              <View style={[styles.historyList, styles.sectionGap]}>
                {orders.map((order) => {
                  const headline = shopOrderHeadline(order);
                  const tone = shopOrderStatusColors(headline.tone);
                  const itemCount = orderItemCount(order);
                  const thumbUrl = resolveMediaUrl(order.lines?.[0]?.product_image_url);
                  const unpaid = isShopOrderUnpaid(order);
                  const deliverySummary = shopOrderDeliverySummary(order);
                  return (
                    <Pressable
                      key={order.id}
                      style={({ pressed }) => [styles.historyCard, pressed && styles.cardPressed]}
                      onPress={() => navigation.navigate('ShopOrderDetail', { orderId: order.id })}
                    >
                      {thumbUrl ? (
                        <Image source={{ uri: thumbUrl }} style={styles.orderThumb} />
                      ) : (
                        <View style={[styles.orderThumb, styles.orderThumbEmpty]}>
                          <Feather name="package" size={18} color={colors.mutedForeground} />
                        </View>
                      )}
                      <View style={styles.sampleBody}>
                        <View style={styles.orderTopRow}>
                          <Text style={styles.orderNumber} numberOfLines={1}>
                            #{order.order_number}
                          </Text>
                          <Text style={styles.orderTotal}>{formatShopMoney(order.total, order.currency)}</Text>
                        </View>
                        <Text style={styles.sampleMeta} numberOfLines={1}>
                          {formatShopOrderPlaced(order.created_at)}
                          {itemCount ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
                        </Text>
                        <View style={styles.orderStatusRow}>
                          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                            <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
                            <Text style={[styles.statusText, { color: tone.text }]} numberOfLines={1}>
                              {deliverySummary?.statusLabel || headline.title}
                              {deliverySummary?.etaLabel ? ` · ETA ${deliverySummary.etaLabel}` : ''}
                            </Text>
                          </View>
                          {unpaid ? <Text style={styles.unpaidHint}>Payment due</Text> : null}
                        </View>
                      </View>
                      {deliverySummary?.active ? (
                        <Text style={[styles.trackAction, { color: primary }]}>{deliverySummary.actionLabel}</Text>
                      ) : (
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={[styles.emptyIcon, { backgroundColor: `${primary}12` }]}>
                  <Feather name="shopping-bag" size={18} color={primary} />
                </View>
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptyText}>
                  Your purchases and receipts stay here, ready to reorder any time.
                </Text>
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: primary }]}
                  onPress={() => navigation.navigate('Shop')}
                >
                  <Text style={styles.emptyCtaText}>Start shopping</Text>
                </Pressable>
              </View>
            )}
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
      </View>
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg },
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  nextLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.4 },
  nextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nextTimingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  nextTimingText: { ...typography.tiny, color: '#fff', fontWeight: '700' },
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
  inviteCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBody: { flex: 1 },
  inviteTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  inviteSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  aboutText: { flex: 1 },
  aboutTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  aboutSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  emptyText: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
  emptyCta: {
    marginTop: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
  },
  emptyCtaText: { ...typography.label, color: '#fff', fontWeight: '700' },
  historyBlock: { gap: spacing.sm, marginBottom: spacing.xl },
  historyList: { gap: spacing.sm },
  sectionGap: { marginBottom: spacing.xl },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.6 },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  repeatText: { ...typography.label, fontWeight: '700', flexShrink: 1 },
  orderThumb: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.muted },
  orderThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  orderTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderNumber: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  orderTotal: { ...typography.label, color: colors.foreground, fontWeight: '800' },
  orderStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    flexShrink: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typography.tiny, fontWeight: '800' },
  unpaidHint: { ...typography.tiny, color: colors.warning, fontWeight: '800' },
  trackAction: { ...typography.caption, fontWeight: '800' },
  activeShipmentCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
  },
  activeShipmentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeShipmentEyebrow: { ...typography.tiny, fontWeight: '800', letterSpacing: 0.6 },
  activeShipmentTitle: { ...typography.label, fontWeight: '800', marginTop: spacing.xs },
  skeletonIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  skeletonLine: { height: 10, borderRadius: radius.sm, backgroundColor: colors.muted },
  skeletonLineShort: { width: '55%', marginTop: spacing.sm },
  sampleBody: { flex: 1 },
  sampleTitle: { ...typography.label, color: colors.foreground },
  sampleMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
