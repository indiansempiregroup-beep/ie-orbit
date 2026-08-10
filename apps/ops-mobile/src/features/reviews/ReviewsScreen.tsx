import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useReviews } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const RATING_FILTERS = [5, 4, 3, 2, 1] as const;

function stars(rating: number) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

export function ReviewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { reviews, loading, reload } = useReviews();
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${reviews.length} customer review${reviews.length === 1 ? '' : 's'}`);
  }, [navigation, reviews.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((review) => {
      if (ratingFilter != null && Math.round(review.rating) !== ratingFilter) {
        return false;
      }
      if (!q) return true;
      return [review.customer_name, review.service_name, review.booking_number, review.comment]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [reviews, search, ratingFilter]);

  const filtersActive = Boolean(search.trim()) || ratingFilter != null;
  const emptyTitle = filtersActive ? 'No matches' : 'No reviews yet';
  const emptyMessage = filtersActive
    ? 'Try a different search or star rating.'
    : 'When a customer rates a completed booking, it will show up here.';

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search customer, service, or note"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="All"
            active={ratingFilter == null}
            onPress={() => setRatingFilter(null)}
          />
          {RATING_FILTERS.map((rating) => (
            <Chip
              key={rating}
              label={`${rating}★`}
              active={ratingFilter === rating}
              onPress={() => setRatingFilter(rating)}
            />
          ))}
        </ScrollView>
        {filtersActive ? (
          <Text style={styles.resultCount}>
            Showing {filtered.length} of {reviews.length}
          </Text>
        ) : null}
      </View>

      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !reviews.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={emptyTitle}
          emptyMessage={emptyMessage}
        />
        {filtered.map((review) => (
          <Card key={review.id}>
            <ListRow
              title={review.customer_name || 'Customer'}
              subtitle={review.service_name || 'Appointment'}
              meta={`#${review.booking_number || review.booking_id.slice(0, 8)} · ${formatRelativeTime(review.created_at)}`}
              avatarName={review.customer_name || 'Customer'}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: review.booking_id })}
            />
            <Text style={styles.rating}>{stars(review.rating)}</Text>
            {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
          </Card>
        ))}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  resultCount: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  rating: { ...typography.title, fontSize: 16, color: colors.primary, marginTop: spacing.sm },
  comment: { ...typography.body, color: colors.mutedForeground, marginTop: spacing.xs, lineHeight: 20 },
});
