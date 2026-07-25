import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BookingRow } from '../../components/BookingRow';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings, useCustomers, useServices, useStaffMembers, useDashboardSummary } from '../../hooks/useOpsData';
import { useBIOverview, useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { brand, colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const today = formatDateKey(new Date());
  const { todayCount, reload: reloadSummary } = useDashboardSummary();
  const { bookings, loading, reload: reloadBookings } = useBookings(today);
  const { customers } = useCustomers();
  const { services } = useServices();
  const { staff } = useStaffMembers();
  const { data: bi } = useBIOverview();
  const { customerMap, serviceMap, staffMap } = useEntityMaps();

  const reload = async () => {
    await Promise.all([reloadSummary(), reloadBookings()]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const isRefreshing = refreshing || loading;

  const upcoming = useMemo(
    () => bookings.filter((b) => b.start_at && new Date(b.start_at) >= new Date()).slice(0, 5),
    [bookings],
  );
  const nextBooking = upcoming[0];
  const displayName = user?.first_name || user?.full_name || 'there';

  return (
    <View style={styles.screen}>
      <RefreshableScrollView refreshing={isRefreshing} onRefresh={onRefresh} contentContainerStyle={styles.scrollContent}>
        <OpsHeader
          title={displayName}
          subtitle={greeting()}
          right={
            <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Search')} hitSlop={8}>
              <Feather name="search" size={18} color="#fff" />
            </Pressable>
          }
        >
          <View style={styles.nextCard}>
            <Text style={styles.nextLabel}>Next up today</Text>
            {nextBooking ? (
              <>
                <Text style={styles.nextTitle}>{entityLabel(serviceMap, nextBooking.service_id, 'Booking')}</Text>
                <Text style={styles.nextHint}>{entityLabel(customerMap, nextBooking.customer_id)}</Text>
                <View style={styles.nextMetaRow}>
                  <View style={styles.nextMetaItem}>
                    <Feather name="clock" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.nextMetaText}>{formatTime(nextBooking.start_at)}</Text>
                  </View>
                  {nextBooking.staff_id ? (
                    <View style={styles.nextMetaItem}>
                      <Feather name="user" size={12} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.nextMetaText}>{entityLabel(staffMap, nextBooking.staff_id)}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  style={styles.manageBtn}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: nextBooking.id })}
                >
                  <Text style={styles.manageText}>Open booking</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.nextTitle}>No upcoming bookings</Text>
                <Text style={styles.nextHint}>Fill today&apos;s schedule with a new appointment.</Text>
                <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('CreateBooking', {})}>
                  <Text style={styles.manageText}>New booking</Text>
                </Pressable>
              </>
            )}
          </View>
        </OpsHeader>

        <View style={styles.body}>
          <View style={styles.statsRow}>
            <StatCard value={String(todayCount)} label="Today" />
            <StatCard value={String(customers.length)} label="Customers" />
            <StatCard value={String(staff.length)} label="Staff" />
            <StatCard value={String(services.length)} label="Services" />
          </View>

          {bi?.revenue?.estimated_revenue != null ? (
            <Pressable style={styles.revenueCard} onPress={() => navigation.navigate('BI', { tab: 'overview' })}>
              <View style={styles.revenueIcon}>
                <Feather name="trending-up" size={18} color={brand.primary} />
              </View>
              <View style={styles.revenueCopy}>
                <Text style={styles.revenueLabel}>Est. revenue · 30 days</Text>
                <Text style={styles.revenueValue}>
                  {bi.revenue.estimated_revenue} {bi.revenue.currency}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          <View style={styles.quickActions}>
            <QuickAction icon="plus-circle" label="Booking" onPress={() => navigation.navigate('CreateBooking', {})} />
            <QuickAction icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
            <QuickAction icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
            <QuickAction icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
          </View>

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
      </RefreshableScrollView>

      <Pressable style={styles.fab} onPress={() => navigation.navigate('CreateBooking', {})}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextCard: {
    marginTop: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  nextLabel: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  nextTitle: { fontFamily: fonts.displayMedium, fontSize: 22, color: '#fff' },
  nextHint: { ...typography.caption, color: 'rgba(255,255,255,0.78)', marginTop: spacing.sm },
  nextMetaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  nextMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextMetaText: { ...typography.caption, color: 'rgba(255,255,255,0.84)' },
  manageBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  manageText: { ...typography.label, color: colors.primary },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.soft,
  },
  statValue: { fontFamily: fonts.displayMedium, fontSize: 20, color: colors.primary },
  statLabel: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2, textAlign: 'center' },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  revenueIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revenueCopy: { flex: 1 },
  revenueLabel: { ...typography.caption, color: colors.mutedForeground },
  revenueValue: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground, marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    ...shadows.soft,
  },
  pressed: { opacity: 0.92 },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
});
