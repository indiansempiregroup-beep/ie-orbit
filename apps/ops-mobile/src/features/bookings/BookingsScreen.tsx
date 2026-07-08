import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings } from '../../hooks/useOpsData';
import { useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function BookingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const [search, setSearch] = useState('');
  const date = filter === 'today' ? formatDateKey(new Date()) : undefined;
  const { bookings, loading, error, reload } = useBookings(date);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...bookings].sort((a, b) => new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime());
    if (!q) return list;
    return list.filter((booking) => {
      const haystack = [
        booking.booking_number,
        entityLabel(customerMap, booking.customer_id),
        entityLabel(serviceMap, booking.service_id),
        entityLabel(staffMap, booking.staff_id, ''),
        booking.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [bookings, search, customerMap, serviceMap, staffMap]);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Bookings" subtitle={filter === 'today' ? 'Today' : 'All bookings'} />
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search bookings" />
        <Button label="New" onPress={() => navigation.navigate('CreateBooking', {})} />
      </View>
      <View style={styles.filters}>
        <FilterChip label="Today" active={filter === 'today'} onPress={() => setFilter('today')} />
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
      </View>
      <RefreshableScrollView refreshing={refreshing || loading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <ScreenState loading={loading && !bookings.length} error={error} empty={!loading && sorted.length === 0} emptyMessage="No bookings found." />
        {sorted.map((booking) => (
          <Pressable key={booking.id} onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}>
            <Card>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.time}>{formatDateTime(booking.start_at)}</Text>
                  <Text style={styles.meta}>{entityLabel(customerMap, booking.customer_id)} · {entityLabel(serviceMap, booking.service_id)}</Text>
                  <Text style={styles.meta}>{entityLabel(staffMap, booking.staff_id, 'Unassigned')}</Text>
                </View>
                <Badge status={mapBookingStatus(booking.status ?? 'pending')} />
              </View>
            </Card>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, alignItems: 'center' },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.secondary, borderColor: colors.primary },
  chipLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  chipLabelActive: { color: colors.primary },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  copy: { flex: 1, gap: 4 },
  time: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
});
