import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BookingRow } from '../../components/BookingRow';
import { CalendarPicker } from '../../components/CalendarPicker';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings } from '../../hooks/useOpsData';
import { useAvailability, useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function CalendarScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selected, setSelected] = useState(() => new Date());
  const dateKey = formatDateKey(selected);
  const { bookings, loading, error, reload } = useBookings(dateKey);
  const { slots, loading: slotsLoading, reload: reloadSlots } = useAvailability(dateKey);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reload(), reloadSlots()]);
  });

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime()),
    [bookings],
  );

  return (
    <View style={styles.screen}>
      <OpsHeader
        title="Calendar"
        subtitle={selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <View style={styles.nav}>
            <Pressable onPress={() => setSelected((d) => addDays(d, -1))} hitSlop={8}>
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => setSelected(new Date())} hitSlop={8}>
              <Text style={styles.today}>Today</Text>
            </Pressable>
            <Pressable onPress={() => setSelected((d) => addDays(d, 1))} hitSlop={8}>
              <Feather name="chevron-right" size={22} color="#fff" />
            </Pressable>
          </View>
        }
      />
      <RefreshableScrollView
        refreshing={refreshing || loading || slotsLoading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <CalendarPicker
          value={dateKey}
          onChange={(iso) => {
            const [y, m, d] = iso.split('-').map(Number);
            setSelected(new Date(y, m - 1, d));
          }}
        />

        <SectionHeader title="Available slots" />
        {slots.length === 0 ? <Text style={styles.meta}>No open slots or still loading.</Text> : null}
        <View style={styles.slotRow}>
          {slots.slice(0, 12).map((slot) => (
            <Pressable
              key={`${slot.start_at}-${slot.staff_id}`}
              style={styles.slot}
              onPress={() =>
                navigation.navigate('CreateBooking', {
                  startAt: slot.start_at,
                  staffId: slot.staff_id ?? undefined,
                  durationMinutes: 30,
                })
              }
            >
              <Text style={styles.slotText}>{formatTime(slot.start_at)}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Bookings" />
        <ScreenState
          loading={loading && !bookings.length}
          error={error}
          empty={!loading && sorted.length === 0}
          emptyMessage="No bookings on this day."
        />
        <View style={styles.list}>
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
        </View>
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  today: { ...typography.caption, color: '#fff', fontWeight: '700' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: -spacing.sm },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.sm },
  slot: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  slotText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  list: { gap: spacing.md, marginTop: -spacing.sm },
});
