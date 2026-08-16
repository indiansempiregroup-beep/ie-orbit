import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BookingCard } from '../../components/BookingCard';
import { Chip } from '../../components/ui/Chip';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const FILTERS = ['All', 'Upcoming', 'Past'] as const;

export function BookingHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');

  const upcomingQuery = filter === 'Upcoming' ? true : filter === 'Past' ? false : undefined;
  const { bookings, loading, reload } = useMobileBookings({ upcoming: upcomingQuery });
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const filterLabels: Record<(typeof FILTERS)[number], string> = {
    All: t('common.all'),
    Upcoming: t('bookings.upcoming'),
    Past: t('bookings.past'),
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((booking) =>
      [booking.service_name, booking.staff_name, booking.booking_number, booking.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [bookings, search]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('bookings.myAppointments')} onBack={() => navigation.goBack()} />
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.search}
            placeholder="Search service, staff, or booking #"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
        <View style={styles.filters}>
          {FILTERS.map((item) => (
            <Chip
              key={item}
              label={filterLabels[item]}
              active={filter === item}
              primaryColor={primary}
              onPress={() => setFilter(item)}
            />
          ))}
        </View>
        {!loading ? (
          <Text style={styles.count}>
            {visible.length} {visible.length === 1 ? 'appointment' : 'appointments'}
          </Text>
        ) : null}
      </View>
      {loading && !bookings.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} colors={[primary]} />
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            primaryColor={primary}
            onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="calendar"
              title={search || filter !== 'All' ? 'No matching appointments' : t('bookings.empty')}
              description={
                search || filter !== 'All'
                  ? 'Try another search or clear the filter.'
                  : 'Book a service and it will show up here.'
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: { ...typography.caption, color: colors.mutedForeground },
  loader: { marginTop: spacing.md },
});
