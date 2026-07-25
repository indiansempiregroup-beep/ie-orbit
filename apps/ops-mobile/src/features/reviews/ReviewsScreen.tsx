import React, { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useReviews } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function stars(rating: number) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

export function ReviewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { reviews, loading, reload } = useReviews();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${reviews.length} customer review${reviews.length === 1 ? '' : 's'}`);
  }, [navigation, reviews.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((review) =>
      [review.customer_name, review.service_name, review.booking_number, review.comment, String(review.rating)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [reviews, search]);

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <SearchBar
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search reviews"
        />
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !reviews.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={search ? 'No matches' : 'No reviews yet'}
          emptyMessage={
            search
              ? 'Try a different customer, service, or rating.'
              : 'When a customer rates a completed booking, it will show up here.'
          }
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  search: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  rating: { ...typography.title, fontSize: 16, color: colors.primary, marginTop: spacing.sm },
  comment: { ...typography.body, color: colors.mutedForeground, marginTop: spacing.xs, lineHeight: 20 },
});
