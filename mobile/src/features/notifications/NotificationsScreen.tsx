import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AmazonFilterSheet, SearchFilterToolbar } from '../../components/AmazonFilterSheet';
import { EmptyState } from '../../components/ProfileMenuScreen';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { GroupedList } from '../../components/ui/GroupedList';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { useMobileNotifications } from '../../hooks/useMobileNotifications';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useScreenInsets, useTabBarLayout } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

const iconMap = {
  booking: 'calendar',
  reminder: 'clock',
  review: 'star',
  cancel: 'x',
  payment: 'credit-card',
  order: 'package',
  return: 'rotate-ccw',
  pet: 'gift',
} as const;

const STATUS_IDS = ['all', 'unread', 'read'] as const;
const TYPE_IDS = [
  'all',
  'booking',
  'reminder',
  'order',
  'return',
  'payment',
  'review',
  'cancel',
  'pet',
] as const;

type StatusFilter = (typeof STATUS_IDS)[number];
type TypeFilter = (typeof TYPE_IDS)[number];
type FilterDraft = { status: StatusFilter; type: TypeFilter };

const EMPTY_FILTERS: FilterDraft = { status: 'all', type: 'all' };

function countActiveFilters(filters: FilterDraft) {
  return (filters.status !== 'all' ? 1 : 0) + (filters.type !== 'all' ? 1 : 0);
}

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Alerts'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function relativeTimeLabel(
  isoDate: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!isoDate) return '';
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutes < 1) return t('customerApp.notifications.justNow');
  if (minutes < 60) return t('customerApp.notifications.minAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('customerApp.notifications.hrAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('customerApp.notifications.yesterday');
  if (days < 7) return t('customerApp.notifications.daysAgo', { n: days });
  return formatRelativeTime(isoDate);
}

export function NotificationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { branding } = useBootstrap();
  const { headerPaddingTop } = useScreenInsets();
  const { contentInset } = useTabBarLayout();
  const primary = branding?.primaryColor ?? colors.primary;
  const { notifications, loading, error, reload, markAllRead, markRead } = useMobileNotifications();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);

  const statusOptions = useMemo(
    () => [
      { id: 'all' as const, label: t('common.all') },
      { id: 'unread' as const, label: t('customerApp.notifications.statusUnread') },
      { id: 'read' as const, label: t('customerApp.notifications.statusRead') },
    ],
    [t],
  );
  const typeOptions = useMemo(
    () => [
      { id: 'all' as const, label: t('customerApp.notifications.typeAll') },
      { id: 'booking' as const, label: t('customerApp.notifications.typeBooking') },
      { id: 'reminder' as const, label: t('customerApp.notifications.typeReminder') },
      { id: 'order' as const, label: t('customerApp.notifications.typeOrder') },
      { id: 'return' as const, label: t('customerApp.notifications.typeReturn') },
      { id: 'payment' as const, label: t('customerApp.notifications.typePayment') },
      { id: 'review' as const, label: t('customerApp.notifications.typeReview') },
      { id: 'cancel' as const, label: t('customerApp.notifications.typeCancel') },
      { id: 'pet' as const, label: t('customerApp.notifications.typePet') },
    ],
    [t],
  );

  useFocusEffect(
    React.useCallback(() => {
      void reload();
    }, [reload]),
  );

  const appliedFilters = useMemo(() => ({ status, type }), [status, type]);
  const activeFilterCount = countActiveFilters(appliedFilters);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return notifications.filter((item) => {
      if (status === 'unread' && item.is_read) return false;
      if (status === 'read' && !item.is_read) return false;
      const itemType = (item.notification_type || 'booking').toLowerCase();
      if (type !== 'all' && itemType !== type) return false;
      if (!needle) return true;
      return [item.subject, item.body, item.notification_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [notifications, search, status, type]);

  const activeSummary = [
    status !== 'all' ? statusOptions.find((item) => item.id === status)?.label : null,
    type !== 'all' ? typeOptions.find((item) => item.id === type)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function openFilters() {
    setDraft(appliedFilters);
    setFilterOpen(true);
  }

  function clearAppliedFilters() {
    setStatus('all');
    setType('all');
    setSearch('');
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Text style={styles.title}>{t('customerApp.notifications.title')}</Text>
        <Pressable onPress={() => void markAllRead()} disabled={!notifications.some((item) => !item.is_read)}>
          <Text style={[styles.markRead, { color: primary }]}>{t('customerApp.notifications.markAllRead')}</Text>
        </Pressable>
      </View>

      <SearchFilterToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder={t('customerApp.notifications.searchPlaceholder')}
        primaryColor={primary}
        activeFilterCount={activeFilterCount}
        onOpenFilters={openFilters}
        activeSummary={activeSummary || undefined}
        onClearFilters={clearAppliedFilters}
        countLabel={
          loading
            ? null
            : activeFilterCount || search.trim()
              ? visible.length === 1
                ? t('customerApp.notifications.alertOneOfTotal', { total: notifications.length })
                : t('customerApp.notifications.alertManyOfTotal', { n: visible.length, total: notifications.length })
              : visible.length === 1
                ? t('customerApp.notifications.alertOne')
                : t('customerApp.notifications.alertMany', { n: visible.length })
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <RefreshableScrollView
        style={styles.list}
        contentContainerStyle={[
          !visible.length ? styles.emptyContainer : styles.listContent,
          { paddingBottom: contentInset },
        ]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        {loading && !notifications.length ? (
          <View style={styles.empty}>
            <ActivityIndicator color={primary} />
          </View>
        ) : null}

        {!loading && !visible.length ? (
          <EmptyState
            icon="bell"
            title={
              notifications.length || search || activeFilterCount
                ? t('customerApp.notifications.noMatchTitle')
                : t('customerApp.notifications.noneTitle')
            }
            description={
              notifications.length || search || activeFilterCount
                ? t('customerApp.notifications.noMatchDescription')
                : t('customerApp.notifications.noneDescription')
            }
          />
        ) : null}

        <GroupedList>
          {visible.map((item) => {
            const itemType = (item.notification_type || 'booking') as keyof typeof iconMap;
            const icon = iconMap[itemType] ?? 'bell';
            return (
              <Pressable
                key={item.id}
                style={[styles.row, !item.is_read && styles.unread]}
                onPress={() => {
                  if (!item.is_read) void markRead(item.id);
                  if (item.return_id) {
                    navigation.navigate('ReturnDetail', { returnId: String(item.return_id) });
                    return;
                  }
                  if (item.order_id) {
                    navigation.navigate('ShopOrderDetail', { orderId: String(item.order_id) });
                    return;
                  }
                  if (item.booking_id) {
                    navigation.navigate('BookingDetail', { bookingId: item.booking_id });
                    return;
                  }
                  const petId = String(item.pet_id || '');
                  if (petId) navigation.navigate('PetDetail', { petId });
                }}
              >
                <View
                  style={[
                    styles.iconWrap,
                    itemType === 'review'
                      ? styles.iconAmber
                      : itemType === 'cancel'
                        ? styles.iconRed
                        : itemType === 'order' || itemType === 'return'
                          ? styles.iconGreen
                          : itemType === 'pet'
                            ? styles.iconPink
                            : styles.iconBlue,
                  ]}
                >
                  <Feather
                    name={icon}
                    size={16}
                    color={
                      itemType === 'review'
                        ? colors.warning
                        : itemType === 'cancel'
                          ? colors.destructive
                          : itemType === 'order' || itemType === 'return'
                            ? colors.success
                            : itemType === 'pet'
                              ? '#DB2777'
                              : primary
                    }
                  />
                </View>
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text style={styles.rowTitle}>{item.subject || t('customerApp.notifications.fallbackSubject')}</Text>
                    {!item.is_read ? <View style={[styles.dot, { backgroundColor: primary }]} /> : null}
                  </View>
                  <Text style={styles.rowBody}>{item.body || ''}</Text>
                  <Text style={styles.time}>{relativeTimeLabel(item.created_at, t)}</Text>
                </View>
              </Pressable>
            );
          })}
        </GroupedList>
      </RefreshableScrollView>

      <AmazonFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        primaryColor={primary}
        sections={[
          { id: 'status', label: t('common.status'), options: statusOptions },
          { id: 'type', label: t('customerApp.notifications.filterType'), options: typeOptions },
        ]}
        values={draft}
        onSelect={(sectionId, optionId) =>
          setDraft((current) => ({ ...current, [sectionId]: optionId }))
        }
        onClear={() => setDraft(EMPTY_FILTERS)}
        applyCount={countActiveFilters(draft)}
        onApply={() => {
          setStatus(draft.status);
          setType(draft.type);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...typography.heading, fontSize: 20, color: colors.foreground },
  markRead: { ...typography.caption, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  error: { ...typography.caption, color: colors.destructive, padding: spacing.lg },
  emptyContainer: { flexGrow: 1 },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.card,
  },
  unread: { backgroundColor: `${colors.primary}06` },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBlue: { backgroundColor: '#DBEAFE' },
  iconAmber: { backgroundColor: '#FEF3C7' },
  iconRed: { backgroundColor: '#FEE2E2' },
  iconGreen: { backgroundColor: '#D1FAE5' },
  iconPink: { backgroundColor: '#FCE7F3' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { ...typography.label, color: colors.foreground, fontWeight: '600', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  rowBody: { ...typography.caption, color: colors.mutedForeground, marginTop: 2, lineHeight: 18 },
  time: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
});
