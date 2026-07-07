import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookingCard } from '../../components/BookingCard';
import { Chip } from '../../components/ui/Chip';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { useMobileBookings } from '../../hooks/useMobileBookings';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';

const FILTERS = ['All', 'Upcoming', 'Past'] as const;

export function BookingHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const upcomingQuery = filter === 'Upcoming' ? true : filter === 'Past' ? false : undefined;
  const { bookings, loading, reload } = useMobileBookings({ upcoming: upcomingQuery });
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  return (
    <ProfileMenuScreen
      title="My Appointments"
      onBack={() => navigation.goBack()}
      refreshing={refreshing || loading}
      onRefresh={onRefresh}
      primaryColor={primary}
    >
      <View style={styles.filters}>
        {FILTERS.map((item) => (
          <Chip key={item} label={item} active={filter === item} primaryColor={primary} onPress={() => setFilter(item)} />
        ))}
      </View>
      {loading ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      {!loading && !bookings.length ? (
        <Text style={styles.empty}>No appointments found for this filter.</Text>
      ) : null}
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          primaryColor={primary}
          onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
        />
      ))}
    </ProfileMenuScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loader: { marginTop: spacing.xl },
  empty: { ...typography.body, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xxxl },
});
