import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BookingRow } from '../../components/BookingRow';
import { OpsHeader, OpsHeaderIconButton } from '../../components/OpsHeader';
import { SoftLockBanner } from '../../components/SoftLockBanner';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { StatTile } from '../../components/ui/StatTile';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings, useCustomers, useServices, useStaffMembers, useDashboardSummary } from '../../hooks/useOpsData';
import { useBIOverview, useEntityMaps } from '../../hooks/useOpsExtended';
import { useOpsClient } from '../../hooks/useOpsClient';
import { entityLabel } from '../../utils/entities';
import { getSubscribedProductIds, hasPetsPack, hasShopie } from '../../utils/products';
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
  const { activeBusiness, businessId } = useWorkspace();
  const client = useOpsClient();
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const today = formatDateKey(new Date());
  const { summary, todayCount, reload: reloadSummary } = useDashboardSummary();
  const { bookings, loading, reload: reloadBookings } = useBookings(today);
  const { customers } = useCustomers();
  const { services } = useServices();
  const { staff } = useStaffMembers();
  const { data: bi } = useBIOverview(showReports);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const [books, setBooks] = useState<ShopBooksDashboard | null>(null);

  const subscribedIds = useMemo(
    () => getSubscribedProductIds(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const hasAppointie =
    Boolean(summary?.appointie) ||
    (summary?.products?.includes('appointie') ??
      (subscribedIds.includes('appointie') || subscribedIds.length === 0));
  const shopieEnabled =
    Boolean(summary?.shopie) ||
    (summary?.products?.includes('shopie') ?? hasShopie(activeBusiness?.product_subscriptions));
  const petsEnabled = Boolean(summary?.pets) || hasPetsPack(activeBusiness?.product_subscriptions);

  const loadBooks = useCallback(async () => {
    if (!shopieEnabled || !businessId || !client) return;
    try {
      const response = await client.shop.booksDashboard({ business_id: businessId });
      setBooks(response.data);
    } catch {
      /* optional KPIs */
    }
  }, [shopieEnabled, businessId, client]);

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

  return (
    <View style={styles.screen}>
      <RefreshableScrollView refreshing={isRefreshing} onRefresh={onRefresh} contentContainerStyle={styles.scrollContent}>
        <OpsHeader
          title={displayName}
          subtitle={greeting()}
          right={<OpsHeaderIconButton icon="search" onPress={() => navigation.navigate('Search')} accessibilityLabel="Search" />}
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
              <Button label="Open orders" size="sm" variant="soft" style={styles.nextBtn} onPress={() => navigation.navigate('ShopOrders')} />
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
          <SoftLockBanner />

          {shopieEnabled && books ? (
            <View style={styles.kpiGrid}>
              <StatTile
                label="To collect"
                value={formatMoney(books.to_collect)}
                tone="positive"
                hint="Receivable"
                onPress={() => navigation.navigate('ShopBooks')}
              />
              <StatTile
                label="To pay"
                value={formatMoney(books.to_pay)}
                tone="negative"
                hint="Payable"
                onPress={() => navigation.navigate('ShopBooks')}
              />
              <StatTile label="Cash in hand" value={formatMoney(books.cash)} onPress={() => navigation.navigate('ShopBooksCash')} />
              <StatTile label="Bank balance" value={formatMoney(books.bank)} onPress={() => navigation.navigate('ShopBooksCash')} />
            </View>
          ) : null}

          {hasAppointie ? (
            <View style={styles.statsRow}>
              <StatTile label="Today" value={String(appointie?.today_bookings ?? todayCount)} />
              <StatTile label="Customers" value={String(appointie?.active_customers ?? customers.length)} />
              {showStaff ? (
                <StatTile label="Staff" value={String(appointie?.staff_on_duty ?? staff.length)} />
              ) : null}
              <StatTile label="Services" value={String(services.length)} />
            </View>
          ) : null}

          {shopieEnabled ? (
            <View style={styles.statsRow}>
              <StatTile label="Orders today" value={String(shopie?.orders_today ?? 0)} />
              <StatTile label="Open" value={String(shopie?.open_orders ?? 0)} />
              <StatTile label="Returns" value={String(shopie?.pending_returns ?? 0)} tone="warning" />
              <StatTile label="Month" value={String(shopie?.orders_month ?? 0)} />
            </View>
          ) : null}

          {petsEnabled ? (
            <View style={styles.statsRow}>
              <StatTile label="Pets" value={String(pets?.total ?? 0)} />
              <StatTile label="Bdays 7d" value={String(pets?.birthdays_next_7d ?? 0)} />
              <StatTile label="Bdays 30d" value={String(pets?.birthdays_next_30d ?? 0)} />
              <StatTile label="Photos" value={String(pets?.with_photo ?? 0)} />
            </View>
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

          <Text style={styles.sectionLabel}>Most used</Text>
          <View style={styles.reportRow}>
            {shopieEnabled ? (
              <>
                <ReportLink
                  label="Sale report"
                  onPress={() => navigation.navigate('ShopBooksReports')}
                />
                <ReportLink label="POS billing" onPress={() => navigation.navigate('ShopPos')} />
                <ReportLink label="Books" onPress={() => navigation.navigate('ShopBooks')} />
              </>
            ) : null}
            {showReports ? (
              <ReportLink label="Business intelligence" onPress={() => navigation.navigate('BI', { tab: 'overview' })} />
            ) : null}
          </View>

          <View style={styles.quickActions}>
            {hasAppointie ? (
              <QuickAction icon="plus-circle" label="Booking" onPress={() => navigation.navigate('CreateBooking', {})} />
            ) : null}
            {shopieEnabled ? (
              <QuickAction icon="shopping-cart" label="POS" onPress={() => navigation.navigate('ShopPos')} />
            ) : null}
            <QuickAction icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
            {hasAppointie ? (
              <QuickAction icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
            ) : null}
            {petsEnabled ? (
              <QuickAction icon="heart" label="Pets" onPress={() => navigation.navigate('ShopPets', undefined)} />
            ) : null}
            {showStaff && hasAppointie ? (
              <QuickAction icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
            ) : null}
          </View>

          {hasAppointie ? (
            <>
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
            </>
          ) : null}
        </View>
      </RefreshableScrollView>

      {hasAppointie ? (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('CreateBooking', {})}>
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      ) : shopieEnabled ? (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('ShopPos')}>
          <Feather name="shopping-cart" size={22} color="#fff" />
        </Pressable>
      ) : null}
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
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 100 },
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
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
    marginBottom: -spacing.sm,
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
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  quickCard: {
    minWidth: '22%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
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
  list: { gap: spacing.md, marginTop: -spacing.sm },
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
  },
});
