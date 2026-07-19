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
import { brand, colors, radius, spacing, typography } from '../../theme/tokens';
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
            <Text style={styles.nextLabel}>Next booking today</Text>
            {nextBooking ? (
              <>
                <Text style={styles.nextTitle}>{entityLabel(serviceMap, nextBooking.service_id, 'Booking')}</Text>
                <Text style={styles.nextHint}>{entityLabel(customerMap, nextBooking.customer_id)}</Text>
                <View style={styles.nextMetaRow}>
                  <View style={styles.nextMetaItem}>
                    <Feather name="clock" size={12} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.nextMetaText}>{formatTime(nextBooking.start_at)}</Text>
                  </View>
                  {nextBooking.staff_id ? (
                    <View style={styles.nextMetaItem}>
                      <Feather name="user" size={12} color="rgba(255,255,255,0.6)" />
                      <Text style={styles.nextMetaText}>{entityLabel(staffMap, nextBooking.staff_id)}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  style={styles.manageBtn}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: nextBooking.id })}
                >
                  <Text style={styles.manageText}>Manage</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.nextTitle}>No upcoming bookings</Text>
                <Text style={styles.nextHint}>Create a booking to fill today&apos;s schedule</Text>
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
            <View style={styles.revenueCard}>
              <View style={[styles.revenueIcon, { backgroundColor: `${brand.primary}14` }]}>
                <Feather name="trending-up" size={18} color={brand.primary} />
              </View>
              <View style={styles.revenueCopy}>
                <Text style={styles.revenueLabel}>Est. revenue (30d)</Text>
                <Text style={styles.revenueValue}>
                  {bi.revenue.estimated_revenue} {bi.revenue.currency}
                </Text>
              </View>
              <Pressable onPress={() => navigation.navigate('BI', { tab: 'overview' })}>
                <Text style={styles.link}>BI</Text>
              </Pressable>
            </View>
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
            emptyMessage="No upcoming bookings today."
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
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xxxl },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextCard: {
    marginTop: spacing.xl,
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
  manageText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: { ...typography.title, fontSize: 18, color: colors.primary },
  statLabel: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2, textAlign: 'center' },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  revenueIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revenueCopy: { flex: 1 },
  revenueLabel: { ...typography.caption, color: colors.mutedForeground },
  revenueValue: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
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
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  link: { ...typography.caption, color: colors.primary, fontWeight: '600' },
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
    elevation: 4,
  },
});
