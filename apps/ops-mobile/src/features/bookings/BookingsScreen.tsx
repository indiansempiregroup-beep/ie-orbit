import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookingRow } from '../../components/BookingRow';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings } from '../../hooks/useOpsData';
import { useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { colors, spacing } from '../../theme/tokens';
import { formatDateKey } from '../../utils/format';
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
    const list = [...bookings].sort(
      (a, b) => new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime(),
    );
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
      <OpsHeader title="Bookings" subtitle={filter === 'today' ? "Today's schedule" : 'All bookings'} />
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search bookings" />
        <Button label="New" onPress={() => navigation.navigate('CreateBooking', {})} />
      </View>
      <View style={styles.filters}>
        <Chip label="Today" active={filter === 'today'} onPress={() => setFilter('today')} />
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !bookings.length}
          error={error}
          empty={!loading && sorted.length === 0}
          emptyMessage="No bookings found."
        />
        {sorted.map((booking) => (
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
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
