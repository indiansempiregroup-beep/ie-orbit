import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '@ie-platform/sdk';
import { BookingRow } from '../../components/BookingRow';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBookings, useStaffMembers } from '../../hooks/useOpsData';
import { useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey } from '../../utils/format';
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

const SORT_OPTIONS = [
  { value: 'start_asc', label: 'Time · earliest' },
  { value: 'start_desc', label: 'Time · latest' },
  { value: 'status', label: 'Status' },
  { value: 'customer', label: 'Customer' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

export function BookingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showStaffFilter = canAccessStaffDirectory(user);
  const [range, setRange] = useState<'today' | 'all'>('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | BookingStatus>('');
  const [staffFilter, setStaffFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('start_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const date = range === 'today' ? formatDateKey(new Date()) : undefined;
  const { bookings, loading, error, reload } = useBookings(date);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const { staff } = useStaffMembers();
  const { refreshing, onRefresh } = usePullToRefresh(reload);

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
    Number(Boolean(statusFilter)) +
    Number(Boolean(showStaffFilter && staffFilter)) +
    Number(sortBy !== 'start_asc');

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...bookings];

    if (statusFilter) {
      list = list.filter((booking) => booking.status === statusFilter);
    }
    if (showStaffFilter && staffFilter) {
      list = list.filter((booking) => booking.staff_id === staffFilter);
    }
    if (q) {
      list = list.filter((booking) => {
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
    }

    list.sort((a, b) => {
      if (sortBy === 'start_desc') {
        return new Date(b.start_at ?? 0).getTime() - new Date(a.start_at ?? 0).getTime();
      }
      if (sortBy === 'status') {
        return String(a.status ?? '').localeCompare(String(b.status ?? ''));
      }
      if (sortBy === 'customer') {
        return entityLabel(customerMap, a.customer_id).localeCompare(entityLabel(customerMap, b.customer_id));
      }
      return new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime();
    });

    return list;
  }, [bookings, search, statusFilter, staffFilter, showStaffFilter, sortBy, customerMap, serviceMap, staffMap]);

  return (
    <View style={styles.screen}>
      <OpsHeader
        compact
        title={t('bookings.title')}
        subtitle={range === 'today' ? t('bookings.todaySchedule') : t('bookings.allBookings')}
      />
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder={t('bookings.search')} />
        <Button label={t('common.new')} onPress={() => navigation.navigate('CreateBooking', {})} />
      </View>
      <View style={styles.filters}>
        <Chip label={t('common.today')} active={range === 'today'} onPress={() => setRange('today')} />
        <Chip label={t('common.all')} active={range === 'all'} onPress={() => setRange('all')} />
        <Pressable style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]} onPress={() => setFiltersOpen(true)}>
          <Feather name="sliders" size={14} color={activeFilterCount > 0 ? colors.primaryForeground : colors.foreground} />
          <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Sort & filter</Text>
              <Pressable onPress={() => setFiltersOpen(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <SelectField
                label={t('bookings.status')}
                value={statusFilter}
                options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                onChange={(value) => setStatusFilter(value as '' | BookingStatus)}
              />
              {showStaffFilter ? (
                <SelectField label={t('bookings.staff')} value={staffFilter} options={staffOptions} onChange={setStaffFilter} />
              ) : null}
              <SelectField
                label="Sort by"
                value={sortBy}
                options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                onChange={(value) => setSortBy(value as SortKey)}
              />
              <Button
                label="Reset filters"
                variant="outline"
                fullWidth
                onPress={() => {
                  setStatusFilter('');
                  setStaffFilter('');
                  setSortBy('start_asc');
                }}
              />
              <Button label="Apply" fullWidth onPress={() => setFiltersOpen(false)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !bookings.length}
          error={error}
          empty={!loading && sorted.length === 0}
          emptyTitle={t('bookings.emptyTitle')}
          emptyMessage={range === 'today' ? t('bookings.emptyToday') : t('bookings.emptyFiltered')}
          actionLabel="New booking"
          onAction={() => navigation.navigate('CreateBooking', {})}
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
  search: { flex: 1 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
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
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: colors.background },
});
