import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings } from '../../hooks/useOpsData';
import { useAvailability } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime, mapBookingStatus } from '../../utils/format';
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
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reload(), reloadSlots()]);
  });

  const weekDays = useMemo(() => {
    const start = addDays(selected, -3);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selected]);

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
            <Pressable onPress={() => setSelected((d) => addDays(d, -1))} hitSlop={8}><Feather name="chevron-left" size={22} color="#fff" /></Pressable>
            <Pressable onPress={() => setSelected(new Date())} hitSlop={8}><Text style={styles.today}>Today</Text></Pressable>
            <Pressable onPress={() => setSelected((d) => addDays(d, 1))} hitSlop={8}><Feather name="chevron-right" size={22} color="#fff" /></Pressable>
          </View>
        }
      />
      <View style={styles.strip}>
        {weekDays.map((day) => {
          const key = formatDateKey(day);
          const active = key === dateKey;
          return (
            <Pressable key={key} style={[styles.day, active && styles.dayActive]} onPress={() => setSelected(day)}>
              <Text style={[styles.dayName, active && styles.dayNameActive]}>{day.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
              <Text style={[styles.dayNum, active && styles.dayNumActive]}>{day.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      <RefreshableScrollView refreshing={refreshing || loading || slotsLoading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <Text style={styles.section}>Available slots</Text>
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

        <Text style={styles.section}>Bookings</Text>
        <ScreenState loading={loading && !bookings.length} error={error} empty={!loading && sorted.length === 0} emptyMessage="No bookings on this day." />
        {sorted.map((booking) => (
          <Pressable key={booking.id} onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}>
            <Card>
              <View style={styles.row}>
                <Text style={styles.time}>{formatTime(booking.start_at)}</Text>
                <Badge status={mapBookingStatus(booking.status ?? 'pending')} />
              </View>
            </Card>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  today: { ...typography.caption, color: '#fff', fontWeight: '700' },
  strip: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xs },
  day: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  dayActive: { backgroundColor: colors.secondary, borderColor: colors.primary },
  dayName: { ...typography.tiny, color: colors.mutedForeground },
  dayNameActive: { color: colors.primary },
  dayNum: { ...typography.label, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  dayNumActive: { color: colors.primary },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  section: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { backgroundColor: colors.secondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999 },
  slotText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { ...typography.title, fontSize: 16, color: colors.foreground },
});
