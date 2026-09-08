import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '@ie-orbit/sdk';
import { BookingRow } from '../../components/BookingRow';
import { GroupedList } from '../../components/ui/GroupedList';
import { DesktopPage } from '../../components/DesktopPage';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useTabBarLayout } from '../../hooks/useTabBarLayout';
import { useBookings, useStaffMembers } from '../../hooks/useOpsData';
import { useEntityMaps } from '../../hooks/useOpsExtended';
import { entityLabel } from '../../utils/entities';
import { bookingCustomerLabel, bookingCustomerPhone, bookingServiceLabel, bookingStaffLabel } from '../../utils/bookingDisplay';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, spacing } from '../../theme/tokens';
import { formatDateKey } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_OPTIONS: Array<{ value: '' | BookingStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

const SORT_OPTIONS = [
  { value: 'start_asc', label: 'Earliest' },
  { value: 'start_desc', label: 'Latest' },
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
  const { contentInset } = useTabBarLayout();

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
    <DesktopPage>
      <OpsHeader compact title={t('nav.bookings')} />
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder={t('bookings.search')} />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        <Button label={t('common.new')} onPress={() => navigation.navigate('CreateBooking', {})} />
      </View>
      <View style={styles.filters}>
        <Chip label={t('common.today')} active={range === 'today'} onPress={() => setRange('today')} />
        <Chip label={t('common.all')} active={range === 'all'} onPress={() => setRange('all')} />
      </View>

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setStatusFilter('');
          setStaffFilter('');
          setSortBy('start_asc');
        }}
      >
        <FilterChoiceGroup
          label={t('bookings.status')}
          value={statusFilter}
          options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => setStatusFilter(value as '' | BookingStatus)}
        />
        {showStaffFilter ? (
          <FilterChoiceGroup label={t('bookings.staff')} value={staffFilter} options={staffOptions} onChange={setStaffFilter} />
        ) : null}
        <FilterChoiceGroup
          label="Sort"
          value={sortBy}
          options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => setSortBy(value as SortKey)}
        />
      </FilterSheet>

      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.content, { paddingBottom: contentInset }]}
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
        <GroupedList>
          {sorted.map((booking) => (
            <BookingRow
              key={booking.id}
              attached
              serviceName={bookingServiceLabel(booking, serviceMap)}
              customerName={bookingCustomerLabel(booking, customerMap)}
              customerPhone={bookingCustomerPhone(booking)}
              staffName={bookingStaffLabel(booking, staffMap)}
              startAt={booking.start_at}
              endAt={booking.end_at}
              durationMinutes={booking.duration_minutes}
              serviceCount={booking.line_items?.length || undefined}
              bookingNumber={booking.booking_number}
              status={booking.status}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
            />
          ))}
        </GroupedList>
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
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
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: colors.background },
});
