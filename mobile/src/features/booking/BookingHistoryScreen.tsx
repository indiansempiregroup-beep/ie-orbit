import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AmazonFilterSheet, SearchFilterToolbar } from '../../components/AmazonFilterSheet';
import { HomeBookingRow } from '../../components/HomeBookingRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type WhenFilter = 'all' | 'upcoming' | 'past';

const WHEN_OPTIONS: Array<{ id: WhenFilter; labelKey?: string; label?: string }> = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'upcoming', labelKey: 'bookings.upcoming' },
  { id: 'past', labelKey: 'bookings.past' },
];

function countActive(when: WhenFilter) {
  return when !== 'all' ? 1 : 0;
}

export function BookingHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const [when, setWhen] = useState<WhenFilter>('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<{ when: WhenFilter }>({ when: 'all' });

  const upcomingQuery = when === 'upcoming' ? true : when === 'past' ? false : undefined;
  const { bookings, loading, reload } = useMobileBookings({ upcoming: upcomingQuery });
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const activeFilterCount = countActive(when);

  const whenOptions = useMemo(
    () =>
      WHEN_OPTIONS.map((item) => ({
        id: item.id,
        label: item.labelKey ? t(item.labelKey) : item.label || item.id,
      })),
    [t],
  );

  const whenLabel = whenOptions.find((item) => item.id === when)?.label ?? t('common.all');

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = !needle
      ? [...bookings]
      : bookings.filter((booking) =>
          [booking.service_name, booking.staff_name, booking.booking_number, booking.status]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );
    return filtered.sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  }, [bookings, search]);

  function openFilters() {
    setDraft({ when });
    setFilterOpen(true);
  }

  function clearAppliedFilters() {
    setWhen('all');
    setSearch('');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('bookings.myAppointments')} onBack={() => navigation.goBack()} />
      <SearchFilterToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search service, staff, or booking #"
        primaryColor={primary}
        activeFilterCount={activeFilterCount}
        onOpenFilters={openFilters}
        activeSummary={when !== 'all' ? whenLabel : undefined}
        onClearFilters={clearAppliedFilters}
        countLabel={
          loading
            ? null
            : `${visible.length} ${visible.length === 1 ? 'appointment' : 'appointments'}`
        }
      />
      {loading && !bookings.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        {...groupedListProps(visible.length, styles.listGroup)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} colors={[primary]} />
        }
        renderItem={({ item }) => (
          <HomeBookingRow
            booking={item}
            variant="recent"
            attached
            primaryColor={primary}
            onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="calendar"
              title={search || when !== 'all' ? 'No matching appointments' : t('bookings.empty')}
              description={
                search || when !== 'all'
                  ? 'Try another search or clear the filter.'
                  : 'Book a service and it will show up here.'
              }
            />
          ) : null
        }
      />

      <AmazonFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        primaryColor={primary}
        sections={[{ id: 'when', label: 'When', options: whenOptions }]}
        values={{ when: draft.when }}
        onSelect={(_sectionId, optionId) => setDraft({ when: optionId as WhenFilter })}
        onClear={() => setDraft({ when: 'all' })}
        applyCount={countActive(draft.when)}
        onApply={() => {
          setWhen(draft.when);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  listGroup: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
});
