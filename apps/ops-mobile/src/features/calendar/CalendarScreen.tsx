import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { BookingStatus } from '@ie-platform/sdk';
import { BookingRow } from '../../components/BookingRow';
import { CalendarPicker } from '../../components/CalendarPicker';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings, useStaffMembers } from '../../hooks/useOpsData';
import { useAvailability, useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_OPTIONS: Array<{ value: '' | BookingStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function CalendarScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showStaffFilter = canAccessStaffDirectory(user);
  const [selected, setSelected] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<'' | BookingStatus>('');
  const [staffFilter, setStaffFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dateKey = formatDateKey(selected);
  const { bookings, loading, error, reload } = useBookings(dateKey);
  const { slots, loading: slotsLoading, reload: reloadSlots } = useAvailability(
    dateKey,
    showStaffFilter ? staffFilter || undefined : undefined,
  );
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const { staff } = useStaffMembers();
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reload(), reloadSlots()]);
  });

  const staffOptions = useMemo(
    () => [
      { value: '', label: 'All staff' },
      ...staff.map((member) => ({
        value: member.id,
        label: member.display_name || member.full_name || member.email || 'Staff',
      })),
    ],
    [staff],
  );

  const activeFilterCount =
    Number(Boolean(statusFilter)) + Number(Boolean(showStaffFilter && staffFilter));

  const sorted = useMemo(() => {
    let list = [...bookings];
    if (statusFilter) {
      list = list.filter((booking) => booking.status === statusFilter);
    }
    if (showStaffFilter && staffFilter) {
      list = list.filter((booking) => booking.staff_id === staffFilter);
    }
    return list.sort(
      (a, b) => new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime(),
    );
  }, [bookings, statusFilter, staffFilter]);

  const emptyMessage =
    activeFilterCount > 0
      ? 'No bookings match these filters for this day.'
      : 'No bookings on this day. Tap a free slot below to book.';

  return (
    <View style={styles.screen}>
      <OpsHeader
        compact
        title="Calendar"
        subtitle={selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <View style={styles.nav}>
            <Pressable style={styles.navBtn} onPress={() => setSelected((d) => addDays(d, -1))} hitSlop={8}>
              <Feather name="chevron-left" size={20} color="#fff" />
            </Pressable>
            <Pressable style={styles.todayBtn} onPress={() => setSelected(new Date())} hitSlop={8}>
              <Text style={styles.today}>Today</Text>
            </Pressable>
            <Pressable style={styles.navBtn} onPress={() => setSelected((d) => addDays(d, 1))} hitSlop={8}>
              <Feather name="chevron-right" size={20} color="#fff" />
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

        <SectionHeader
          title="Day agenda"
          action={
            <Pressable
              style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
              onPress={() => setFiltersOpen(true)}
            >
              <Feather
                name="sliders"
                size={14}
                color={activeFilterCount > 0 ? colors.primaryForeground : colors.foreground}
              />
              <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </Pressable>
          }
        />

        <ScreenState
          loading={loading && !bookings.length}
          error={error}
          empty={!loading && sorted.length === 0}
          emptyTitle={activeFilterCount > 0 ? 'No matches' : 'Free day'}
          emptyMessage={emptyMessage}
          actionLabel="New booking"
          onAction={() => navigation.navigate('CreateBooking', {})}
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

        <SectionHeader title="Open slots" />
        {slots.length === 0 ? (
          <Text style={styles.meta}>
            {staffFilter ? 'No open timeslots for this staff member.' : 'No open timeslots for this day.'}
          </Text>
        ) : null}
        <View style={styles.slotRow}>
          {slots.slice(0, 16).map((slot) => (
            <Pressable
              key={`${slot.start_at}-${slot.staff_id}`}
              style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
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
      </RefreshableScrollView>

      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Agenda filters</Text>
              <Pressable onPress={() => setFiltersOpen(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <SelectField
                label="Status"
                value={statusFilter}
                options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                onChange={(value) => setStatusFilter(value as '' | BookingStatus)}
              />
              {showStaffFilter ? (
                <SelectField label="Staff" value={staffFilter} options={staffOptions} onChange={setStaffFilter} />
              ) : null}
              <Button
                label="Reset filters"
                variant="outline"
                fullWidth
                onPress={() => {
                  setStatusFilter('');
                  setStaffFilter('');
                }}
              />
              <Button label="Apply" fullWidth onPress={() => setFiltersOpen(false)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  today: { ...typography.caption, fontFamily: fonts.bodySemi, color: '#fff' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBtnText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  filterBtnTextActive: { color: colors.primaryForeground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: -spacing.sm },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.sm },
  slot: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotPressed: { opacity: 0.9 },
  slotText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  list: { gap: spacing.md, marginTop: -spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.foreground },
  sheetContent: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl },
});
