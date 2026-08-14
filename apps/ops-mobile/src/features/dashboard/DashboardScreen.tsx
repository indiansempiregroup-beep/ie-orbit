import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BookingRow } from '../../components/BookingRow';
import { OpsHeader, OpsHeaderIconButton } from '../../components/OpsHeader';
import { SoftLockBanner } from '../../components/SoftLockBanner';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopContent } from '../../components/DesktopContent';
import { ScreenState } from '../../components/ScreenState';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useBookings, useCustomers, useServices, useStaffMembers, useDashboardSummary } from '../../hooks/useOpsData';
import { useBIOverview, useEntityMaps, usePlanFeatures } from '../../hooks/useOpsExtended';
import { useOpsClient } from '../../hooks/useOpsClient';
import { entityLabel } from '../../utils/entities';
import { getSubscribedProductIds, hasPetsPack, hasShopie } from '../../utils/products';
import { PlanFeature, SHOPIE_BOOKS_FEATURES } from '../../utils/planFeatures';
import { canAccessReports, canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksDashboard } from '@ie-platform/sdk';
import { formatMoney } from '../shop/shopBooksHelpers';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { activeBusiness, businessId } = useWorkspace();
  const client = useOpsClient();
  const { isDesktop } = useBreakpoint();
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const { has, hasAny } = usePlanFeatures();
  const today = formatDateKey(new Date());
  const { summary, todayCount, reload: reloadSummary } = useDashboardSummary();
  const { bookings, loading, reload: reloadBookings } = useBookings(today);
  const { customers } = useCustomers();
  const { services } = useServices();
  const { staff } = useStaffMembers();
  const { data: bi } = useBIOverview(showReports);
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
  const showCashTiles = shopieEnabled && has(PlanFeature.shopieBooksCash);
  const showPartyTiles = shopieEnabled && has(PlanFeature.shopieBooksParties);

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
    }, [loadBooks]),
  );

  const reload = async () => {
    await Promise.all([reloadSummary(), reloadBookings(), loadBooks()]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const isRefreshing = refreshing || loading;

  const upcoming = useMemo(
    () => bookings.filter((b) => b.start_at && new Date(b.start_at) >= new Date()).slice(0, 5),
    [bookings],
  );
  const completedToday = useMemo(
    () => bookings.filter((b) => String(b.status || '').toLowerCase() === 'completed').length,
    [bookings],
  );
  const nextBooking = upcoming[0];
  const displayName = user?.first_name || user?.full_name || 'there';
  const appointie = summary?.appointie;
  const shopie = summary?.shopie;
  const pets = summary?.pets;
  const revenueTeaser =
    bi?.appointie?.revenue?.estimated_revenue ?? bi?.revenue?.estimated_revenue ?? bi?.shopie?.gmv ?? null;
  const revenueCurrency =
    bi?.appointie?.revenue?.currency ?? bi?.revenue?.currency ?? bi?.shopie?.currency ?? summary?.currency ?? '';
  const revenueLabel = bi?.appointie || bi?.revenue ? 'Est. revenue · 30 days' : 'GMV · 30 days';

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
          text: `Next: ${entityLabel(serviceMap, nextBooking.service_id, 'Booking')} at ${formatTime(nextBooking.start_at)}`,
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

  return (
    <View style={styles.screen}>
      <RefreshableScrollView refreshing={isRefreshing} onRefresh={onRefresh} contentContainerStyle={styles.scrollContent}>
        <OpsHeader
          title={displayName}
          subtitle={greeting()}
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
        >
          {hasAppointie ? (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>Next up today</Text>
              {nextBooking ? (
                <>
                  <Text style={styles.nextTitle}>{entityLabel(serviceMap, nextBooking.service_id, 'Booking')}</Text>
                  <Text style={styles.nextHint}>{entityLabel(customerMap, nextBooking.customer_id)}</Text>
                  <View style={styles.nextMetaRow}>
                    <View style={styles.nextMetaItem}>
                      <Feather name="clock" size={12} color={colors.mutedForeground} />
                      <Text style={styles.nextMetaText}>{formatTime(nextBooking.start_at)}</Text>
                    </View>
                    {nextBooking.staff_id ? (
                      <View style={styles.nextMetaItem}>
                        <Feather name="user" size={12} color={colors.mutedForeground} />
                        <Text style={styles.nextMetaText}>{entityLabel(staffMap, nextBooking.staff_id)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Button
                    label="Open booking"
                    size="sm"
                    variant="soft"
                    style={styles.nextBtn}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: nextBooking.id })}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.nextTitle}>No upcoming bookings</Text>
                  <Text style={styles.nextHint}>Fill today&apos;s schedule with a new appointment.</Text>
                  <Button
                    label="New booking"
                    size="sm"
                    style={styles.nextBtn}
                    onPress={() => navigation.navigate('CreateBooking', {})}
                  />
                </>
              )}
            </View>
          ) : shopieEnabled ? (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>ShopIE today</Text>
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
              <Text style={styles.nextHint}>Subscribe to AppointIE or ShopIE to see live ops metrics here.</Text>
            </View>
          )}
        </OpsHeader>

        <View style={styles.body}>
          <DesktopContent>
            <View style={[styles.bodyInner, isDesktop && styles.bodyInnerDesktop]}>
              <SoftLockBanner />

              {insightLines.length ? (
                <View style={styles.insightCard}>
                  <Text style={styles.insightTitle}>Today at a glance</Text>
                  {insightLines.map((line) => (
                    <View key={line.text} style={styles.insightRow}>
                      <View style={styles.insightIcon}>
                        <Feather name={line.icon} size={14} color={colors.primary} />
                      </View>
                      <Text style={styles.insightText}>{line.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {shopieEnabled && books && (showCashTiles || showPartyTiles) ? (
                <TileGrid gap={spacing.md}>
                  {showPartyTiles ? (
                    <StatTile
                      label="To collect"
                      value={formatMoney(books.to_collect)}
                      tone="positive"
                      hint="Receivable"
                      onPress={() => navigation.navigate('ShopBooks')}
                    />
                  ) : null}
                  {showPartyTiles ? (
                    <StatTile
                      label="To pay"
                      value={formatMoney(books.to_pay)}
                      tone="negative"
                      hint="Payable"
                      onPress={() => navigation.navigate('ShopBooks')}
                    />
                  ) : null}
                  {showCashTiles ? (
                    <StatTile label="Cash in hand" value={formatMoney(books.cash)} onPress={() => navigation.navigate('ShopBooksCash')} />
                  ) : null}
                  {showCashTiles ? (
                    <StatTile label="Bank balance" value={formatMoney(books.bank)} onPress={() => navigation.navigate('ShopBooksCash')} />
                  ) : null}
                </TileGrid>
              ) : null}

              {hasAppointie ? (
                <TileGrid>
                  <StatTile label="Today" value={String(appointie?.today_bookings ?? todayCount)} hint="Bookings" />
                  <StatTile label="Left today" value={String(upcoming.length)} hint="Upcoming" />
                  <StatTile label="Customers" value={String(appointie?.active_customers ?? customers.length)} />
                  {showStaff ? (
                    <StatTile label="Staff" value={String(appointie?.staff_on_duty ?? staff.length)} />
                  ) : (
                    <StatTile label="Services" value={String(services.length)} />
                  )}
                </TileGrid>
              ) : null}

              {shopieEnabled && (showOrders || showReturns) ? (
                <TileGrid>
                  {showOrders ? <StatTile label="Orders today" value={String(shopie?.orders_today ?? 0)} /> : null}
                  {showOrders ? <StatTile label="Open" value={String(shopie?.open_orders ?? 0)} /> : null}
                  {showReturns ? (
                    <StatTile label="Returns" value={String(shopie?.pending_returns ?? 0)} tone="warning" />
                  ) : null}
                  {showOrders ? <StatTile label="Month" value={String(shopie?.orders_month ?? 0)} /> : null}
                </TileGrid>
              ) : null}

              {petsEnabled ? (
                <TileGrid>
                  <StatTile label="Pets" value={String(pets?.total ?? 0)} />
                  <StatTile label="Bdays 7d" value={String(pets?.birthdays_next_7d ?? 0)} />
                  <StatTile label="Bdays 30d" value={String(pets?.birthdays_next_30d ?? 0)} />
                  <StatTile label="Photos" value={String(pets?.with_photo ?? 0)} />
                </TileGrid>
              ) : null}

              {showReports && revenueTeaser != null ? (
                <Pressable style={styles.revenueCard} onPress={() => navigation.navigate('BI', { tab: 'overview' })}>
                  <View style={styles.revenueIcon}>
                    <Feather name="trending-up" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.revenueCopy}>
                    <Text style={styles.revenueLabel}>{revenueLabel}</Text>
                    <Text style={styles.revenueValue}>
                      {revenueTeaser} {revenueCurrency}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}

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
                    <>
                      <Text style={styles.sectionLabel}>Reports</Text>
                      <View style={styles.reportRow}>
                        {has(PlanFeature.shopieGstReports) ? (
                          <ReportLink label="Sale report" onPress={() => navigation.navigate('ShopBooksReports')} />
                        ) : null}
                        {showPos ? (
                          <ReportLink label="Sale (POS)" onPress={() => navigation.navigate('ShopPos')} />
                        ) : null}
                        {showReports ? (
                          <ReportLink label="Business intelligence" onPress={() => navigation.navigate('BI', { tab: 'overview' })} />
                        ) : null}
                      </View>
                    </>
                  )}
                </View>

                {hasAppointie ? (
                  <View style={isDesktop ? styles.desktopCol : undefined}>
                    <SectionHeader
                      title="Upcoming today"
                      action={
                        <Pressable onPress={() => navigation.navigate('Main', { screen: 'Bookings' } as never)}>
                          <Text style={styles.link}>See all</Text>
                        </Pressable>
                      }
                    />
                    <ScreenState
                      loading={loading && !bookings.length}
                      empty={!loading && upcoming.length === 0}
                      emptyTitle="Clear schedule"
                      emptyMessage="No upcoming bookings left today."
                      actionLabel="New booking"
                      onAction={() => navigation.navigate('CreateBooking', {})}
                    />
                    <View style={styles.list}>
                      {upcoming.map((booking) => (
                        <BookingRow
                          key={booking.id}
                          serviceName={entityLabel(serviceMap, booking.service_id, 'Booking')}
                          customerName={entityLabel(customerMap, booking.customer_id)}
                          staffName={entityLabel(staffMap, booking.staff_id, '')}
                          startAt={booking.start_at}
                          bookingNumber={booking.booking_number}
                          status={booking.status}
                          onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </DesktopContent>
        </View>
      </RefreshableScrollView>

      {showFab ? (
        <Pressable
          style={[styles.fab, isDesktop && styles.fabDesktop]}
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
                <View style={styles.fabOptionIcon}>
                  <Feather name="calendar" size={18} color={colors.primary} />
                </View>
                <View style={styles.fabOptionCopy}>
                  <Text style={styles.fabOptionLabel}>Booking</Text>
                  <Text style={styles.fabOptionHint}>New appointment</Text>
                </View>
              </Pressable>
            ) : null}
            {showPos ? (
              <Pressable style={styles.fabOption} onPress={openSale}>
                <View style={styles.fabOptionIcon}>
                  <Feather name="shopping-cart" size={18} color={colors.primary} />
                </View>
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

function ReportLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.reportLink, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.reportLinkText}>{label}</Text>
      <Feather name="chevron-right" size={14} color={colors.primary} />
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
  return (
    <Pressable style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 100 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextCard: {
    marginTop: spacing.xl,
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
  body: { paddingTop: spacing.xxl },
  bodyInner: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  bodyInnerDesktop: { paddingHorizontal: 0, gap: spacing.xl },
  desktopSplit: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  desktopCol: { flex: 1, gap: spacing.lg, minWidth: 0 },
  insightCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
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
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  revenueIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revenueCopy: { flex: 1 },
  revenueLabel: { ...typography.caption, color: colors.mutedForeground },
  revenueValue: { ...typography.title, color: colors.foreground, marginTop: 2 },
  sectionLabel: {
    ...typography.label,
    color: colors.mutedForeground,
  },
  reportRow: { gap: spacing.sm },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  reportLinkText: { ...typography.body, fontFamily: fonts.bodyMedium, color: colors.foreground },
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
  },
  pressed: { opacity: 0.92 },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  link: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  list: { gap: spacing.md },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
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
  },
  fabDesktop: {
    display: 'none',
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
  fabOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOptionCopy: { flex: 1 },
  fabOptionLabel: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  fabOptionHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
