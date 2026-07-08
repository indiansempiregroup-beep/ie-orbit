import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings, useCustomers, useServices, useStaffMembers, useDashboardSummary } from '../../hooks/useOpsData';
import { useBIOverview } from '../../hooks/useOpsExtended';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = formatDateKey(new Date());
  const { todayCount, reload: reloadSummary } = useDashboardSummary();
  const { bookings, loading, reload: reloadBookings } = useBookings(today);
  const { customers } = useCustomers();
  const { services } = useServices();
  const { staff } = useStaffMembers();
  const { data: bi } = useBIOverview();

  const reload = async () => {
    await Promise.all([reloadSummary(), reloadBookings()]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const isRefreshing = refreshing || loading;

  const upcoming = bookings.filter((b) => b.start_at && new Date(b.start_at) >= new Date()).slice(0, 5);

  return (
    <View style={styles.screen}>
      <OpsHeader
        title="Dashboard"
        subtitle="Today's overview"
        right={
          <Pressable onPress={() => navigation.navigate('Search')} hitSlop={8}>
            <Feather name="search" size={22} color="#fff" />
          </Pressable>
        }
      />
      <RefreshableScrollView refreshing={isRefreshing} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}><Text style={styles.statValue}>{todayCount}</Text><Text style={styles.statLabel}>Bookings today</Text></Card>
          <Card style={styles.statCard}><Text style={styles.statValue}>{customers.length}</Text><Text style={styles.statLabel}>Customers</Text></Card>
        </View>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}><Text style={styles.statValue}>{services.length}</Text><Text style={styles.statLabel}>Services</Text></Card>
          <Card style={styles.statCard}><Text style={styles.statValue}>{staff.length}</Text><Text style={styles.statLabel}>Staff</Text></Card>
        </View>
        {bi?.revenue?.estimated_revenue != null ? (
          <Card><Text style={styles.statLabel}>Est. revenue (30d)</Text><Text style={styles.statValue}>{bi.revenue.estimated_revenue} {bi.revenue.currency}</Text></Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming today</Text>
          <Pressable onPress={() => navigation.navigate('Main')}>
            <Text style={styles.link}>Bookings tab</Text>
          </Pressable>
        </View>
        <ScreenState loading={loading && !bookings.length} empty={!loading && upcoming.length === 0} emptyMessage="No upcoming bookings today." />
        {upcoming.map((booking) => (
          <Pressable key={booking.id} onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}>
            <Card style={styles.bookingCard}>
              <View style={styles.bookingRow}>
                <Text style={styles.bookingTime}>{formatTime(booking.start_at)}</Text>
                <Badge status={mapBookingStatus(booking.status ?? 'pending')} />
              </View>
            </Card>
          </Pressable>
        ))}

        <Card style={styles.quickCard}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.quickRow}>
            <QuickAction icon="plus-circle" label="Booking" onPress={() => navigation.navigate('CreateBooking', {})} />
            <QuickAction icon="users" label="Customers" onPress={() => navigation.navigate('Customers')} />
            <QuickAction icon="package" label="Services" onPress={() => navigation.navigate('Services')} />
          </View>
          <View style={styles.quickRow}>
            <QuickAction icon="user-check" label="Staff" onPress={() => navigation.navigate('StaffList')} />
            <QuickAction icon="bar-chart-2" label="BI" onPress={() => navigation.navigate('BI', { tab: 'overview' })} />
            <QuickAction icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} />
          </View>
        </Card>
      </RefreshableScrollView>
      <Pressable style={styles.fab} onPress={() => navigation.navigate('CreateBooking', {})}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Feather name={icon} size={18} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1 },
  statValue: { ...typography.heading, color: colors.primary },
  statLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.foreground },
  link: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  bookingCard: { marginBottom: 0 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookingTime: { ...typography.title, fontSize: 16, color: colors.foreground },
  quickCard: { marginTop: spacing.md },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickAction: { flex: 1, alignItems: 'center', gap: spacing.xs, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: spacing.lg },
  quickLabel: { ...typography.caption, color: colors.secondaryForeground, fontWeight: '600' },
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
