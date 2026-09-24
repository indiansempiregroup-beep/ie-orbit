import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { TodayBookingsPanel } from '../../components/TodayBookingsPanel';
import { TodayOrdersPanel } from '../../components/TodayOrdersPanel';
import { HomeOpsTabs } from '../../components/HomeOpsTabs';
import { OpsHeader, OpsHeaderIconButton } from '../../components/OpsHeader';
import { SoftLockBanner } from '../../components/SoftLockBanner';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopContent } from '../../components/DesktopContent';
import { AssistantFab } from '../../components/AssistantFab';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { Button } from '../../components/ui/Button';
import { IconBadge } from '../../components/ui/IconBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useTabBarLayout } from '../../hooks/useTabBarLayout';
import { useBookings, useDashboardSummary } from '../../hooks/useOpsData';
import { useShopOrders } from '../../hooks/useShopOrders';
import { useBIOverview, useEntityMaps, usePlanFeatures } from '../../hooks/useOpsExtended';
import { useOpsClient } from '../../hooks/useOpsClient';
import {
  bookingCustomerLabel,
  bookingServiceLabel,
  filterUpcomingBookings,
} from '../../utils/bookingDisplay';
import { getSubscribedProductIds, hasPetsPack, hasShopie } from '../../utils/products';
import { homeOrdersFromList } from '../../utils/shopOrderDisplay';
import { PlanFeature, SHOPIE_BOOKS_FEATURES } from '../../utils/planFeatures';
import { canAccessReports, canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, radius, shadows, spacing, typography, type IconTone } from '../../theme/tokens';
import { formatDateKey, formatTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksDashboard } from '@ie-orbit/sdk';
import { formatMoney } from '../shop/shopBooksHelpers';
import { DashboardAnalytics } from './DashboardAnalytics';

export function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { unreadCount, reload: reloadNotifications } = useNotifications();
  const { activeBusiness, businessId } = useWorkspace();
  const client = useOpsClient();
  const { isDesktop } = useBreakpoint();
  const { contentInset } = useTabBarLayout();
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const { has, hasAny } = usePlanFeatures();
  const today = formatDateKey(new Date());
  const { summary, todayCount, reload: reloadSummary } = useDashboardSummary();
  const { bookings, loading, reload: reloadBookings } = useBookings(today);
  const { data: bi, reload: reloadBi } = useBIOverview(showReports);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const [books, setBooks] = useState<ShopBooksDashboard | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  const subscribedIds = useMemo(
    () => getSubscribedProductIds(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const hasAppointie =
    (Boolean(summary?.appointie) ||
      (summary?.products?.includes('appointie') ??
        (subscribedIds.includes('appointie') || subscribedIds.length === 0))) &&
    has(PlanFeature.appointieBookings);
  const shopieEnabled =
    Boolean(summary?.shopie) ||
    (summary?.products?.includes('shopie') ?? hasShopie(activeBusiness?.product_subscriptions));
  const petsEnabled = Boolean(summary?.pets) || hasPetsPack(activeBusiness?.product_subscriptions);
  const showPos = shopieEnabled && has(PlanFeature.shopiePos);
  const showBooksHub = shopieEnabled && hasAny(SHOPIE_BOOKS_FEATURES);
  const showOrders = shopieEnabled && has(PlanFeature.shopieOrders);
  const showReturns = shopieEnabled && has(PlanFeature.shopieReturns);
  const showAssistant = has(PlanFeature.shopieAiAssistant) || has(PlanFeature.appointieAiAssistant);
  const showCashTiles = shopieEnabled && has(PlanFeature.shopieBooksCash);
  const showPartyTiles = shopieEnabled && has(PlanFeature.shopieBooksParties);
  const { orders: shopOrders, loading: ordersLoading, reload: reloadOrders } = useShopOrders(showOrders);

  const loadBooks = useCallback(async () => {
    if (!showBooksHub || !businessId || !client) return;
    try {
      const response = await client.shop.booksDashboard({ business_id: businessId });
      setBooks(response.data);
    } catch {
      /* optional KPIs */
    }
  }, [showBooksHub, businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void loadBooks();
      void reloadOrders();
      void reloadNotifications();
    }, [loadBooks, reloadOrders, reloadNotifications]),
  );

  const reload = async () => {
    await Promise.all([
      reloadSummary(),
      reloadBookings(),
      loadBooks(),
      reloadOrders(),
      reloadNotifications(),
      reloadBi(),
    ]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const upcoming = useMemo(() => filterUpcomingBookings(bookings).slice(0, 5), [bookings]);
  const openOrders = useMemo(() => homeOrdersFromList(shopOrders), [shopOrders]);
  const nextBooking = upcoming[0];
  const completedToday = useMemo(
    () => bookings.filter((b) => String(b.status || '').toLowerCase() === 'completed').length,
    [bookings],
  );
  const appointie = summary?.appointie;
  const shopie = summary?.shopie;
  const pets = summary?.pets;
  const revenueCurrency =
    bi?.appointie?.revenue?.currency ?? bi?.revenue?.currency ?? bi?.shopie?.currency ?? summary?.currency ?? '';

  const insightLines = useMemo(() => {
    const lines: Array<{ icon: keyof typeof Feather.glyphMap; text: string }> = [];
    if (hasAppointie) {
      const remaining = upcoming.length;
      lines.push({
        icon: 'calendar',
        text:
          remaining > 0
            ? `${remaining} booking${remaining === 1 ? '' : 's'} still ahead today · ${completedToday} done`
            : todayCount > 0
              ? `All ${todayCount} bookings for today are done`
              : 'No bookings scheduled for today',
      });
      if (nextBooking?.start_at) {
        lines.push({
          icon: 'clock',
          text: `Next: ${bookingServiceLabel(nextBooking, serviceMap)} · ${bookingCustomerLabel(nextBooking, customerMap)} at ${formatTime(nextBooking.start_at)}`,
        });
      }
    }
    if (shopieEnabled && books) {
      if (Number(books.to_collect || 0) > 0) {
        lines.push({
          icon: 'trending-up',
          text: `${formatMoney(books.to_collect)} waiting to collect from parties`,
        });
      }
      if (Number(books.to_pay || 0) > 0) {
        lines.push({
          icon: 'alert-circle',
          text: `${formatMoney(books.to_pay)} due to suppliers`,
        });
      }
    }
    if (shopieEnabled && shopie) {
      if ((shopie.open_orders ?? 0) > 0) {
        lines.push({
          icon: 'shopping-bag',
          text: `${shopie.open_orders} open order${shopie.open_orders === 1 ? '' : 's'} need attention`,
        });
      }
      if ((shopie.pending_returns ?? 0) > 0) {
        lines.push({
          icon: 'rotate-ccw',
          text: `${shopie.pending_returns} return${shopie.pending_returns === 1 ? '' : 's'} pending`,
        });
      }
    }
    if (petsEnabled && pets && (pets.birthdays_next_7d ?? 0) > 0) {
      lines.push({
        icon: 'heart',
        text: `${pets.birthdays_next_7d} pet birthday${pets.birthdays_next_7d === 1 ? '' : 's'} in the next 7 days`,
      });
    }
    return lines.slice(0, 4);
  }, [
    hasAppointie,
    upcoming.length,
    completedToday,
    todayCount,
    nextBooking,
    serviceMap,
    customerMap,
    shopieEnabled,
    books,
    shopie,
    petsEnabled,
    pets,
  ]);

  const showFab = hasAppointie || showPos;
  const fabNeedsMenu = hasAppointie && showPos;

  function openCreateBooking() {
    setFabOpen(false);
    navigation.navigate('CreateBooking', {});
  }

  function openSale() {
    setFabOpen(false);
    navigation.navigate('ShopPos');
  }

  function onFabPress() {
    if (fabNeedsMenu) {
      setFabOpen(true);
      return;
    }
    if (hasAppointie) openCreateBooking();
    else openSale();
  }

  const showHomeTabs = hasAppointie && showOrders;

  const bookingsPanel = (
    <TodayBookingsPanel
      bookings={upcoming}
      loading={loading}
      serviceMap={serviceMap}
      customerMap={customerMap}
      staffMap={staffMap}
      hideHeader={showHomeTabs}
      hidePanelMargin={showHomeTabs}
      onPressBooking={(bookingId) => navigation.navigate('BookingDetail', { bookingId })}
      onSeeAll={() => navigation.navigate('Main', { screen: 'Bookings' } as never)}
      onCreateBooking={() => navigation.navigate('CreateBooking', {})}
    />
  );

  const ordersPanel = (
    <TodayOrdersPanel
      orders={openOrders}
      loading={ordersLoading}
      customerMap={customerMap}
      hideHeader={showHomeTabs}
      hidePanelMargin={showHomeTabs}
      onPressOrder={(orderId) => navigation.navigate('ShopOrderDetail', { orderId })}
      onSeeAll={() => navigation.navigate('ShopOrders')}
      onOpenOrders={() => navigation.navigate('ShopOrders')}
    />
  );

  return (
    <View style={styles.screen}>
      <OpsHeader
        compact
        title={t('nav.home')}
        right={
          <View style={styles.headerActions}>
            <OpsHeaderIconButton
              icon="search"
              onPress={() => navigation.navigate('Search')}
              accessibilityLabel="Search"
            />
            <OpsHeaderIconButton
              icon="bell"
              badge={unreadCount}
              onPress={() => navigation.navigate('Alerts')}
              accessibilityLabel="Alerts"
            />
          </View>
        }
      />
      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: contentInset }}
      >
        <View style={styles.body}>
          <DesktopContent>
            <View style={[styles.bodyInner, isDesktop && styles.bodyInnerDesktop]}>
              <SoftLockBanner />

              <View style={styles.operationsCard}>
                <Text style={styles.sectionTitle}>Today</Text>
                {showHomeTabs ? (
                  <HomeOpsTabs
                    bookingsCount={upcoming.length}
                    ordersCount={openOrders.length}
                    bookingsPanel={bookingsPanel}
                    ordersPanel={ordersPanel}
                  />
                ) : hasAppointie ? (
                  bookingsPanel
                ) : showOrders ? (
                  ordersPanel
                ) : shopieEnabled ? (
                  <View style={styles.nextCard}>
                    <Text style={styles.nextLabel}>Orbit Mart today</Text>
                    <Text style={styles.nextTitle}>{shopie?.orders_today ?? 0} orders</Text>
                    <Text style={styles.nextHint}>
                      {shopie?.pending_returns ?? 0} pending returns · {shopie?.open_orders ?? 0} open
                    </Text>
                    <Button
                      label={showOrders ? 'Open online orders' : 'Open shop'}
                      size="sm"
                      variant="soft"
                      style={styles.nextBtn}
                      onPress={() => navigation.navigate(showOrders ? 'ShopOrders' : showPos ? 'ShopPos' : 'ShopBooks')}
                    />
                  </View>
                ) : (
                  <View style={styles.nextCard}>
                    <Text style={styles.nextLabel}>Workspace</Text>
                    <Text style={styles.nextTitle}>Ready when you are</Text>
                    <Text style={styles.nextHint}>Subscribe to Orbit Appoint or Orbit Mart to see live ops metrics here.</Text>
                  </View>
                )}
              </View>

              {insightLines.length ? (
                <View style={styles.insightCard}>
                  <Text style={styles.insightTitle}>Today at a glance</Text>
                  {insightLines.map((line) => (
                    <View key={line.text} style={styles.insightRow}>
                      <IconBadge
                        icon={line.icon}
                        size="sm"
                        tone={line.icon === 'alert-circle' ? 'coral' : line.icon === 'trending-up' ? 'green' : 'blue'}
                      />
                      <Text style={styles.insightText}>{line.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {hasAppointie || shopieEnabled ? (
                <TileGrid gap={spacing.md}>
                  {hasAppointie ? (
                    <StatTile
                      label="Today"
                      value={String(appointie?.today_bookings ?? todayCount)}
                      hint={`${upcoming.length} still ahead`}
                      icon="calendar"
                      iconTone="blue"
                    />
                  ) : null}
                  {hasAppointie ? (
                    <StatTile
                      label="Month revenue"
                      value={formatMoney(appointie?.estimated_revenue_month)}
                      hint={revenueCurrency || 'Est.'}
                      icon="trending-up"
                      iconTone="green"
                      onPress={showReports ? () => navigation.navigate('BI', { tab: 'revenue' }) : undefined}
                    />
                  ) : null}
                  {shopieEnabled && showOrders ? (
                    <StatTile
                      label="Orders today"
                      value={String(shopie?.orders_today ?? 0)}
                      hint={`${shopie?.open_orders ?? 0} open`}
                      icon="shopping-bag"
                      iconTone="green"
                      onPress={() => navigation.navigate('ShopOrders')}
                    />
                  ) : null}
                  {shopieEnabled ? (
                    <StatTile
                      label="GMV this month"
                      value={formatMoney(shopie?.gmv_month)}
                      hint={summary?.currency ?? ''}
                      icon="bar-chart-2"
                      iconTone="violet"
                    />
                  ) : null}
                  {showPartyTiles && books ? (
                    <StatTile
                      label="To collect"
                      value={formatMoney(books.to_collect)}
                      tone="positive"
                      hint="Receivable"
                      icon="arrow-down-circle"
                      iconTone="green"
                      onPress={() => navigation.navigate('ShopBooks')}
                    />
                  ) : null}
                  {showReturns ? (
                    <StatTile
                      label="Returns"
                      value={String(shopie?.pending_returns ?? 0)}
                      tone={(shopie?.pending_returns ?? 0) > 0 ? 'warning' : 'default'}
                      icon="rotate-ccw"
                      iconTone="coral"
                    />
                  ) : null}
                </TileGrid>
              ) : null}

              <DashboardAnalytics
                bi={bi}
                summary={summary}
                books={books}
                bookings={bookings}
                shopOrders={shopOrders}
                hasAppointie={hasAppointie}
                shopieEnabled={shopieEnabled}
                petsEnabled={petsEnabled}
                showCashTiles={showCashTiles}
                showPartyTiles={showPartyTiles}
                showReports={showReports}
                currency={revenueCurrency}
                onOpenBI={() => navigation.navigate('BI', { tab: 'overview' })}
              />

              <View style={isDesktop ? styles.desktopSplit : undefined}>
                <View style={isDesktop ? styles.desktopCol : undefined}>
                  <Text style={styles.sectionLabel}>Quick actions</Text>
                  <TileGrid columns={isDesktop ? 4 : 2} gap={spacing.md}>
                    {hasAppointie ? (
                      <QuickAction icon="plus-circle" label="Booking" onPress={() => navigation.navigate('CreateBooking', {})} />
                    ) : null}
                    {showPos ? (
                      <QuickAction icon="shopping-cart" label="Sale" onPress={() => navigation.navigate('ShopPos')} />
                    ) : null}
                    {has(PlanFeature.appointieCustomers) || shopieEnabled ? (
                      <QuickAction icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
                    ) : null}
                    {showAssistant ? (
                      <QuickAction icon="message-circle" label="Assistant" onPress={() => navigation.navigate('Assistant')} />
                    ) : null}
                    {hasAppointie && has(PlanFeature.appointieServices) ? (
                      <QuickAction icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
                    ) : null}
                    {showBooksHub ? (
                      <QuickAction icon="layers" label="Books" onPress={() => navigation.navigate('ShopBooks')} />
                    ) : null}
                    {petsEnabled ? (
                      <QuickAction icon="heart" label="Pets" onPress={() => navigation.navigate('ShopPets', undefined)} />
                    ) : null}
                    {showStaff && hasAppointie && has(PlanFeature.appointieStaff) ? (
                      <QuickAction icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
                    ) : null}
                  </TileGrid>

                  {(showBooksHub || showPos || showReports) && (
                    <View style={styles.reportsCard}>
                      <Text style={styles.sectionLabel}>Reports</Text>
                      <TileGrid gap={spacing.md}>
                        {has(PlanFeature.shopieGstReports) ? (
                          <ReportLink
                            icon="bar-chart-2"
                            tone="violet"
                            label="Sale report"
                            hint="GST, P&L and books"
                            onPress={() => navigation.navigate('ShopBooksReports')}
                          />
                        ) : null}
                        {showPos ? (
                          <ReportLink
                            icon="shopping-cart"
                            tone="green"
                            label="Sale (POS)"
                            hint="Open the counter"
                            onPress={() => navigation.navigate('ShopPos')}
                          />
                        ) : null}
                        {showReports ? (
                          <ReportLink
                            icon="pie-chart"
                            tone="blue"
                            label="Intelligence"
                            hint="Overview & growth"
                            onPress={() => navigation.navigate('BI', { tab: 'overview' })}
                          />
                        ) : null}
                      </TileGrid>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </DesktopContent>
        </View>
      </RefreshableScrollView>

      {showAssistant ? (
        <AssistantFab
          onPress={() => navigation.navigate('Assistant')}
          style={[
            styles.assistantFab,
            {
              bottom: isDesktop
                ? spacing.xxl
                : contentInset + (showFab ? 68 : 0),
              right: isDesktop ? spacing.xxl : spacing.xl,
            },
          ]}
        />
      ) : null}

      {showFab && !isDesktop ? (
        <Pressable
          style={[styles.fab, { bottom: contentInset, right: spacing.xl }]}
          onPress={onFabPress}
          accessibilityLabel={fabNeedsMenu ? 'Create booking or sale' : hasAppointie ? 'New booking' : 'New sale'}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      ) : null}

      <Modal visible={fabOpen} transparent animationType="fade" onRequestClose={() => setFabOpen(false)}>
        <Pressable style={styles.fabBackdrop} onPress={() => setFabOpen(false)}>
          <View style={styles.fabSheet}>
            <Text style={styles.fabSheetTitle}>Create</Text>
            {hasAppointie ? (
              <Pressable style={styles.fabOption} onPress={openCreateBooking}>
                <IconBadge icon="calendar" tone="blue" />
                <View style={styles.fabOptionCopy}>
                  <Text style={styles.fabOptionLabel}>Booking</Text>
                  <Text style={styles.fabOptionHint}>New appointment</Text>
                </View>
              </Pressable>
            ) : null}
            {showPos ? (
              <Pressable style={styles.fabOption} onPress={openSale}>
                <IconBadge icon="shopping-cart" tone="green" />
                <View style={styles.fabOptionCopy}>
                  <Text style={styles.fabOptionLabel}>Sale</Text>
                  <Text style={styles.fabOptionHint}>POS checkout</Text>
                </View>
              </Pressable>
            ) : null}
            <Button label="Cancel" variant="outline" fullWidth onPress={() => setFabOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReportLink({
  icon,
  tone,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  tone: IconTone;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.reportLink, pressed && styles.pressed]} onPress={onPress}>
      <IconBadge icon={icon} tone={tone} />
      <Text style={styles.reportLinkText} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.reportHint} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const tones: Partial<Record<keyof typeof Feather.glyphMap, IconTone>> = {
    'plus-circle': 'blue',
    'shopping-cart': 'green',
    users: 'cyan',
    package: 'amber',
    layers: 'violet',
    heart: 'rose',
    'user-check': 'coral',
  };
  return (
    <Pressable style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]} onPress={onPress}>
      <IconBadge icon={icon} tone={tones[icon] ?? 'blue'} />
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextCard: {
    backgroundColor: colors.tint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  nextLabel: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  nextTitle: { ...typography.title, color: colors.foreground },
  nextHint: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  nextMetaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  nextMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextMetaText: { ...typography.caption, color: colors.mutedForeground },
  nextBtn: { alignSelf: 'flex-start', marginTop: spacing.md },
  body: { paddingTop: spacing.xl },
  bodyInner: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  bodyInnerDesktop: { paddingHorizontal: 0, gap: spacing.xl },
  desktopSplit: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  desktopCol: { flex: 1, gap: spacing.lg, minWidth: 0 },
  operationsCard: { gap: spacing.md },
  sectionTitle: {
    ...typography.title,
    color: colors.foreground,
    fontSize: 19,
  },
  insightCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  insightTitle: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  insightText: { ...typography.body, color: colors.foreground, flex: 1, lineHeight: 20 },
  sectionLabel: {
    ...typography.label,
    color: colors.mutedForeground,
  },
  reportsCard: { gap: spacing.md },
  reportLink: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...shadows.soft,
  },
  reportLinkText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground, textAlign: 'center' },
  reportHint: { ...typography.tiny, color: colors.mutedForeground, textAlign: 'center' },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...shadows.soft,
  },
  pressed: { opacity: 0.92 },
  quickLabel: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  assistantFab: {
    position: 'absolute',
    zIndex: 20,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 19,
  },
  fabBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    padding: spacing.xl,
  },
  fabSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fabSheetTitle: { ...typography.title, color: colors.foreground },
  fabOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  fabOptionCopy: { flex: 1 },
  fabOptionLabel: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  fabOptionHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
