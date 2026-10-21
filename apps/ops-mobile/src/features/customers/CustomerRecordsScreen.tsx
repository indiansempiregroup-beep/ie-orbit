import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type {
  BookingReview,
  CustomerBorrowLedgerEntry,
  CustomerLoyaltyLedgerEntry,
  CustomerLoyaltyReport,
} from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Chip } from '../../components/ui/Chip';
import { GroupedList } from '../../components/ui/GroupedList';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useCustomer, useReviews } from '../../hooks/useOpsData';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { formatMoney } from '../shop/posPayment';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDate, formatTime, getApiErrorMessage } from '../../utils/format';
import { shareCsv, toCsv } from '../../utils/shareCsv';
import type { RootStackParamList } from '../../navigation/types';

export type CustomerRecordsTab = 'activity' | 'rewards' | 'reviews';

const PAGE_SIZE = 10;
const TABS: Array<{ id: CustomerRecordsTab; label: string }> = [
  { id: 'activity', label: 'Activity' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'reviews', label: 'Reviews' },
];

function stars(rating: number) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function activityLabel(entry: CustomerBorrowLedgerEntry) {
  if (entry.entry_type === 'payment') return 'Payment';
  if (entry.entry_type === 'charge') return 'Credit';
  if (entry.entry_type === 'adjustment') return 'Adjustment';
  return entry.entry_type || 'Activity';
}

function stamp(iso?: string | null) {
  if (!iso) return '';
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

function safeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'customer';
}

function LoyaltyPagination({
  total,
  offset,
  pageSize,
  onPageChange,
}: {
  total: number;
  offset: number;
  pageSize: number;
  onPageChange: (offset: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  const currentPage = Math.min(totalPages, Math.floor(Math.max(0, offset) / Math.max(1, pageSize)) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  return (
    <View style={styles.pager}>
      <Text style={styles.pagerMeta}>
        {from}–{to} of {total}
      </Text>
      {totalPages > 1 ? (
        <View style={styles.pagerNav}>
          <Pressable
            style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => onPageChange(Math.max(0, offset - pageSize))}
          >
            <Text style={styles.pagerBtnText}>Prev</Text>
          </Pressable>
          <Pressable
            style={[styles.pagerBtn, currentPage >= totalPages && styles.pagerBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => onPageChange(offset + pageSize)}
          >
            <Text style={styles.pagerBtnText}>Next</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function CustomerRecordsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerRecords'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();
  const customerId = route.params.customerId;
  const { customer } = useCustomer(customerId);
  const { reviews, loading: reviewsLoading, reload: reloadReviews } = useReviews(customerId);

  const [tab, setTab] = useState<CustomerRecordsTab>(route.params.tab ?? 'activity');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activityType, setActivityType] = useState('');
  const [rewardDirection, setRewardDirection] = useState('');
  const [reviewRating, setReviewRating] = useState('');
  const [page, setPage] = useState(0);
  const [ledger, setLedger] = useState<CustomerBorrowLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [rewardReport, setRewardReport] = useState<CustomerLoyaltyReport | null>(null);
  const [rewardOffset, setRewardOffset] = useState(0);
  const [rewardLoading, setRewardLoading] = useState(true);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const rewardRequestRef = useRef(0);

  const customerName =
    route.params.customerName ||
    customer?.display_name?.trim() ||
    customer?.full_name?.trim() ||
    'Customer';
  const currency = customer?.borrow_currency || activeBusiness?.currency || 'INR';
  const money = (value: number) => formatMoney(value, currency);

  const loadLedger = useCallback(async () => {
    if (!client) return;
    setLedgerLoading(true);
    try {
      const response = await client.customers.listBorrowLedger(customerId);
      setLedger(response.data ?? []);
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  }, [client, customerId]);

  const loadRewards = useCallback(async () => {
    if (!client || !businessId) return;
    const requestId = ++rewardRequestRef.current;
    setRewardLoading(true);
    setRewardError(null);
    try {
      const response = await client.customers.loyaltyReport({
        business: businessId,
        customer: customerId,
        direction: rewardDirection || undefined,
        q: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset: rewardOffset,
      });
      if (requestId !== rewardRequestRef.current) return;
      setRewardReport(response.data);
    } catch (err) {
      if (requestId !== rewardRequestRef.current) return;
      setRewardReport(null);
      setRewardError(getApiErrorMessage(err, "Couldn't load reward points."));
    } finally {
      if (requestId === rewardRequestRef.current) setRewardLoading(false);
    }
  }, [businessId, client, customerId, rewardDirection, rewardOffset, search]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  useEffect(() => {
    setPage(0);
  }, [search, activityType, reviewRating]);

  useEffect(() => {
    setRewardOffset(0);
  }, [search, rewardDirection]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadLedger(), reloadReviews(), tab === 'rewards' ? loadRewards() : Promise.resolve()]);
  }, [loadLedger, loadRewards, reloadReviews, tab]);
  const { refreshing, onRefresh } = usePullToRefresh(reloadAll);

  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter((entry) => {
      if (activityType && entry.entry_type !== activityType) return false;
      if (!q) return true;
      return [activityLabel(entry), entry.order_number, entry.notes, entry.payment_method]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [activityType, ledger, search]);

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rating = reviewRating ? Number(reviewRating) : null;
    return reviews.filter((review) => {
      if (rating != null && Math.round(review.rating) !== rating) return false;
      if (!q) return true;
      return [review.service_name, review.comment, review.booking_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [reviewRating, reviews, search]);

  const pagedActivity = filteredActivity.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pagedReviews = filteredReviews.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rewardRows = rewardReport?.ledger ?? [];
  const rewardTotal = rewardReport?.ledger_total ?? rewardRows.length;
  const rewardBalance = Number(customer?.loyalty_points ?? 0);

  const filterCount =
    tab === 'activity'
      ? Number(Boolean(activityType))
      : tab === 'rewards'
        ? Number(Boolean(rewardDirection))
        : Number(Boolean(reviewRating));

  useLayoutEffect(() => {
    const count =
      tab === 'activity' ? filteredActivity.length : tab === 'rewards' ? rewardTotal : filteredReviews.length;
    setStackSubtitle(navigation, `${customerName} · ${count} ${tab}`);
  }, [customerName, filteredActivity.length, filteredReviews.length, navigation, rewardTotal, tab]);

  function openActivity(entry: CustomerBorrowLedgerEntry) {
    const orderId = String(entry.order_id || '').trim();
    if (orderId) {
      navigation.navigate('ShopOrderDetail', { orderId });
      return;
    }
    toast.push('This activity is not linked to an order.', 'info');
  }

  function openReward(row: CustomerLoyaltyLedgerEntry) {
    const sourceLabel = String(row.source_label || '').trim();
    const recordKind = String(row.record_kind || '').trim();
    const bookingId = String(row.booking_id || '').trim();
    const orderId = String(row.linked_order_id || row.order_id || '').trim();
    const voucherId = String(row.invoice_voucher_id || row.voucher_id || '').trim();
    const isOnlineOrder = sourceLabel === 'Online order' || sourceLabel.startsWith('Online order');

    if (recordKind === 'booking' || sourceLabel === 'Booking' || (bookingId && !orderId && !voucherId)) {
      if (bookingId) {
        navigation.navigate('BookingDetail', { bookingId });
        return;
      }
    }
    if (isOnlineOrder || recordKind === 'order') {
      if (orderId) {
        navigation.navigate('ShopOrderDetail', { orderId });
        return;
      }
    }
    if (bookingId) {
      navigation.navigate('BookingDetail', { bookingId });
      return;
    }
    if (orderId) {
      navigation.navigate('ShopOrderDetail', { orderId });
      return;
    }
    if (voucherId) {
      navigation.navigate('ShopBooksSale', { voucherId });
      return;
    }
    toast.push('This reward entry is not linked to a record.', 'info');
  }

  function openReview(review: BookingReview) {
    const bookingId = String(review.booking_id || '').trim();
    if (!bookingId) {
      toast.push('This review is not linked to a booking.', 'info');
      return;
    }
    navigation.navigate('BookingDetail', { bookingId });
  }

  async function exportCurrent() {
    const stamp = new Date().toISOString().slice(0, 10);
    const prefix = safeFilename(customerName);
    try {
      if (tab === 'activity') {
        await shareCsv(
          `${prefix}_activity_${stamp}.csv`,
          toCsv(
            ['Date', 'Type', 'Amount', 'Balance after', 'Order', 'Payment method', 'Notes'],
            filteredActivity.map((entry) => [
              entry.created_at || '',
              activityLabel(entry),
              entry.amount,
              entry.balance_after,
              entry.order_number || '',
              entry.payment_method || '',
              entry.notes || '',
            ]),
          ),
        );
      } else if (tab === 'rewards') {
        let rows = rewardRows;
        if (client && businessId) {
          const response = await client.customers.loyaltyReport({
            business: businessId,
            customer: customerId,
            direction: rewardDirection || undefined,
            q: search.trim() || undefined,
            limit: 500,
            offset: 0,
          });
          rows = response.data?.ledger ?? rows;
        }
        await shareCsv(
          `${prefix}_rewards_${stamp}.csv`,
          toCsv(
            ['Date', 'Type', 'Reason', 'Points', 'Source', 'Record'],
            rows.map((row) => [
              row.created_at || '',
              row.direction === 'reversed' || row.entry_type === 'earn_reversal'
                ? 'Reversed'
                : row.points_delta >= 0
                  ? 'Given'
                  : 'Used',
              row.reason || row.entry_type || '',
              row.points_delta,
              row.source_label || '',
              row.order_number || row.booking_number || row.voucher_number || '',
            ]),
          ),
        );
      } else {
        await shareCsv(
          `${prefix}_reviews_${stamp}.csv`,
          toCsv(
            ['Date', 'Rating', 'Service', 'Booking', 'Comment'],
            filteredReviews.map((review) => [
              review.created_at || '',
              review.rating,
              review.service_name || '',
              review.booking_number || review.booking_id,
              review.comment || '',
            ]),
          ),
        );
      }
      toast.push('Export ready.', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't export this list."), 'error');
    }
  }

  const loading =
    tab === 'activity'
      ? ledgerLoading
      : tab === 'rewards'
        ? rewardLoading || (!rewardReport && !rewardError)
        : reviewsLoading;
  const empty =
    tab === 'activity'
      ? !loading && pagedActivity.length === 0
      : tab === 'rewards'
        ? !loading && !rewardError && rewardRows.length === 0
        : !loading && pagedReviews.length === 0;

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <View style={styles.tabs}>
          {TABS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              active={tab === item.id}
              onPress={() => {
                setTab(item.id);
                if (item.id === 'rewards' && !rewardReport && !rewardLoading) {
                  void loadRewards();
                }
              }}
            />
          ))}
        </View>
        <View style={styles.tools}>
          <SearchBar
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={
              tab === 'activity'
                ? 'Search activity or order'
                : tab === 'rewards'
                  ? 'Search reason'
                  : 'Search review or booking'
            }
          />
          <FilterButton count={filterCount} onPress={() => setFiltersOpen(true)} />
          <Pressable style={styles.exportBtn} onPress={() => void exportCurrent()} accessibilityLabel="Export CSV">
            <Feather name="share" size={18} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setActivityType('');
          setRewardDirection('');
          setReviewRating('');
        }}
      >
        {tab === 'activity' ? (
          <FilterChoiceGroup
            label="Activity type"
            value={activityType}
            onChange={setActivityType}
            options={[
              { value: '', label: 'All' },
              { value: 'charge', label: 'Credit' },
              { value: 'payment', label: 'Payment' },
              { value: 'adjustment', label: 'Adjustment' },
            ]}
          />
        ) : null}
        {tab === 'rewards' ? (
          <FilterChoiceGroup
            label="Points"
            value={rewardDirection}
            onChange={setRewardDirection}
            options={[
              { value: '', label: 'All' },
              { value: 'given', label: 'Given' },
              { value: 'used', label: 'Used' },
              { value: 'reversed', label: 'Reversed' },
            ]}
          />
        ) : null}
        {tab === 'reviews' ? (
          <FilterChoiceGroup
            label="Rating"
            value={reviewRating}
            onChange={setReviewRating}
            options={[
              { value: '', label: 'All' },
              { value: '5', label: '5★' },
              { value: '4', label: '4★' },
              { value: '3', label: '3★' },
              { value: '2', label: '2★' },
              { value: '1', label: '1★' },
            ]}
          />
        ) : null}
      </FilterSheet>

      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {tab === 'rewards' && rewardReport ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Reward points</Text>
            <Text style={styles.summaryValue}>{rewardBalance}</Text>
            <Text style={styles.summaryMeta}>
              Given {rewardReport.summary.points_earned} · Used {rewardReport.summary.points_redeemed}
              {rewardReport.enabled === false ? ' · Program off' : ''}
            </Text>
          </View>
        ) : null}

        <ScreenState
          loading={loading}
          error={tab === 'rewards' ? rewardError : null}
          empty={empty}
          actionLabel={tab === 'rewards' && rewardError ? 'Retry' : undefined}
          onAction={tab === 'rewards' && rewardError ? () => void loadRewards() : undefined}
          emptyTitle={search.trim() || filterCount ? 'No matches' : 'Nothing here yet'}
          emptyMessage={
            search.trim() || filterCount
              ? 'Try a different search or filter.'
              : tab === 'activity'
                ? 'Borrow charges and repayments will show up here.'
                : tab === 'rewards'
                  ? 'Points given or used by this customer will show up here.'
                  : 'When they rate a completed booking, it will show up here.'
          }
        />

        {tab === 'activity' ? (
          <>
            <GroupedList>
              {pagedActivity.map((entry) => (
                <ListRow
                  key={entry.id}
                  icon={entry.entry_type === 'payment' ? 'check-circle' : 'credit-card'}
                  iconTone={entry.entry_type === 'payment' ? 'green' : 'amber'}
                  title={`${activityLabel(entry)} · ${money(Number(entry.amount))}`}
                  subtitle={
                    entry.order_number
                      ? `Order ${entry.order_number} · Balance ${money(Number(entry.balance_after))}`
                      : `${entry.notes?.trim() || 'Not linked to an order'} · Balance ${money(Number(entry.balance_after))}`
                  }
                  meta={stamp(entry.created_at) || 'Date not recorded'}
                  onPress={() => openActivity(entry)}
                />
              ))}
            </GroupedList>
            <LoyaltyPagination
              total={filteredActivity.length}
              offset={page * PAGE_SIZE}
              pageSize={PAGE_SIZE}
              onPageChange={(offset) => setPage(Math.floor(offset / PAGE_SIZE))}
            />
          </>
        ) : null}

        {tab === 'rewards' ? (
          <>
            <GroupedList>
              {rewardRows.map((row) => {
                const label =
                  row.order_number || row.booking_number || row.voucher_number || row.source_label || row.reason;
                const isReversal =
                  row.direction === 'reversed' || row.entry_type === 'earn_reversal';
                const reversedPts = Math.max(
                  0,
                  Number(row.record_points_reversed) || (isReversal ? Math.abs(row.points_delta) : 0),
                );
                const title = isReversal
                  ? `−${reversedPts || Math.abs(row.points_delta)} reversed`
                  : `${row.points_delta >= 0 ? '+' : ''}${row.points_delta} points`;
                return (
                  <ListRow
                    key={row.id}
                    icon={isReversal ? 'rotate-ccw' : row.points_delta >= 0 ? 'gift' : 'tag'}
                    iconTone={isReversal ? 'rose' : row.points_delta >= 0 ? 'green' : 'amber'}
                    title={title}
                    subtitle={row.reason || row.entry_type || label || 'Points update'}
                    meta={stamp(row.created_at) || 'Date not recorded'}
                    onPress={() => openReward(row)}
                  />
                );
              })}
            </GroupedList>
            <LoyaltyPagination
              total={rewardTotal}
              offset={rewardOffset}
              pageSize={PAGE_SIZE}
              onPageChange={setRewardOffset}
            />
          </>
        ) : null}

        {tab === 'reviews' ? (
          <>
            <GroupedList>
              {pagedReviews.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <ListRow
                    icon="star"
                    iconTone="amber"
                    title={review.service_name || 'Appointment'}
                    subtitle={`${stars(review.rating)} · #${review.booking_number || review.booking_id.slice(0, 8)}`}
                    meta={stamp(review.created_at) || 'Date not recorded'}
                    onPress={() => openReview(review)}
                  />
                  {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
                </View>
              ))}
            </GroupedList>
            <LoyaltyPagination
              total={filteredReviews.length}
              offset={page * PAGE_SIZE}
              pageSize={PAGE_SIZE}
              onPageChange={(offset) => setPage(Math.floor(offset / PAGE_SIZE))}
            />
          </>
        ) : null}
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
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: { flex: 1 },
  exportBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  summaryTitle: { ...typography.caption, color: colors.mutedForeground },
  summaryValue: { ...typography.title, fontSize: 28, color: colors.foreground },
  summaryMeta: { ...typography.caption, color: colors.mutedForeground },
  reviewItem: { paddingBottom: spacing.sm },
  comment: {
    ...typography.body,
    color: colors.mutedForeground,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pagerMeta: { ...typography.caption, color: colors.mutedForeground },
  pagerNav: { flexDirection: 'row', gap: spacing.sm },
  pagerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { ...typography.label, color: colors.foreground },
});
