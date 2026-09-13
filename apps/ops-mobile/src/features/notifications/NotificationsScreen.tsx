import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Notification } from '@ie-orbit/sdk';
import { Feather } from '@expo/vector-icons';
import { DesktopPage } from '../../components/DesktopPage';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconBadge } from '../../components/ui/IconBadge';
import { useNotifications } from '../../contexts/NotificationsContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { colors, fonts, radius, shadows, spacing, typography, type IconTone } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const TYPE_META: Record<string, { icon: keyof typeof Feather.glyphMap; tone: IconTone; label: string }> = {
  booking: { icon: 'calendar', tone: 'navy', label: 'Booking' },
  reminder: { icon: 'clock', tone: 'cyan', label: 'Reminder' },
  review: { icon: 'star', tone: 'amber', label: 'Review' },
  cancel: { icon: 'x', tone: 'rose', label: 'Cancelled' },
  payment: { icon: 'credit-card', tone: 'green', label: 'Payment' },
  order: { icon: 'package', tone: 'violet', label: 'Order' },
  return: { icon: 'rotate-ccw', tone: 'coral', label: 'Return' },
  pet: { icon: 'gift', tone: 'rose', label: 'Pet' },
};

function typeMeta(type?: string) {
  return TYPE_META[type || ''] ?? { icon: 'bell' as const, tone: 'navy' as IconTone, label: 'Alert' };
}

function dayGroup(iso?: string) {
  if (!iso) return 'Earlier';
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return 'Earlier';
}

function openRelatedItem(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  notification: Notification,
) {
  if (notification.pet_id) {
    navigation.navigate('ShopPetDetail', { petId: notification.pet_id, openNotify: true });
    return;
  }
  if (notification.booking_id) {
    navigation.navigate('BookingDetail', { bookingId: notification.booking_id });
    return;
  }
  if (notification.notification_type === 'payment') {
    navigation.navigate('ProductSettings');
  }
}

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { notifications, loading, reload, markRead, markAllRead, unreadCount } = useNotifications();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const [readFilter, setReadFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const list = notifications.filter((notification) => {
      if (readFilter === 'unread' && notification.is_read) return false;
      if (readFilter === 'read' && !notification.is_read) return false;
      if (typeFilter && String(notification.notification_type || '') !== typeFilter) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [notifications, readFilter, typeFilter, sortBy]);

  const grouped = useMemo(() => {
    const sections: Array<{ title: string; items: Notification[] }> = [];
    for (const item of filtered) {
      const title = dayGroup(item.created_at);
      const last = sections[sections.length - 1];
      if (last?.title === title) last.items.push(item);
      else sections.push({ title, items: [item] });
    }
    return sections;
  }, [filtered]);

  const extraFilterCount = Number(Boolean(typeFilter)) + Number(sortBy !== 'newest');

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: undefined });
    setStackSubtitle(
      navigation,
      unreadCount ? `${unreadCount} unread` : notifications.length ? 'You’re all caught up' : 'No alerts yet',
    );
  }, [navigation, notifications.length, unreadCount]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <View style={styles.chips}>
          <Chip label="All" active={!readFilter} onPress={() => setReadFilter('')} />
          <Chip
            label={unreadCount ? `Unread · ${unreadCount}` : 'Unread'}
            active={readFilter === 'unread'}
            onPress={() => setReadFilter(readFilter === 'unread' ? '' : 'unread')}
          />
        </View>
        <FilterButton count={extraFilterCount} onPress={() => setFiltersOpen(true)} />
      </View>

      {unreadCount > 0 ? (
        <View style={styles.actionRow}>
          <Pressable onPress={() => void markAllRead()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all as read</Text>
          </Pressable>
        </View>
      ) : null}

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setTypeFilter('');
          setSortBy('newest');
        }}
      >
        <FilterChoiceGroup
          label="Type"
          value={typeFilter}
          options={[
            { value: '', label: 'All' },
            { value: 'booking', label: 'Bookings' },
            { value: 'order', label: 'Orders' },
            { value: 'payment', label: 'Payments' },
            { value: 'return', label: 'Returns' },
            { value: 'review', label: 'Reviews' },
            { value: 'pet', label: 'Pets' },
          ]}
          onChange={setTypeFilter}
        />
        <FilterChoiceGroup
          label="Sort"
          value={sortBy}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'oldest', label: 'Oldest' },
          ]}
          onChange={setSortBy}
        />
      </FilterSheet>

      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState loading={loading && !notifications.length} />
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="bell"
            tone="navy"
            title={notifications.length ? 'No matching alerts' : 'No alerts yet'}
            message={
              notifications.length
                ? 'Try All, or clear type filters.'
                : 'Booking, order, and payment updates will show up here.'
            }
            actionLabel={notifications.length ? 'Clear filters' : undefined}
            onAction={
              notifications.length
                ? () => {
                    setReadFilter('');
                    setTypeFilter('');
                    setSortBy('newest');
                  }
                : undefined
            }
          />
        ) : null}

        {grouped.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.group}>
              {section.items.map((notification, index) => {
                const meta = typeMeta(notification.notification_type);
                const unread = !notification.is_read;
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => {
                      if (unread) void markRead(notification.id);
                      openRelatedItem(navigation, notification);
                    }}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <View style={[styles.row, index > 0 && styles.rowDivider, unread && styles.rowUnread]}>
                      {unread ? <View style={styles.unreadBar} /> : <View style={styles.unreadSpacer} />}
                      <IconBadge icon={meta.icon} tone={meta.tone} />
                      <View style={styles.copy}>
                        <View style={styles.metaRow}>
                          <Text style={styles.typeLabel}>{meta.label}</Text>
                          <Text style={styles.time}>{formatRelativeTime(notification.created_at)}</Text>
                        </View>
                        <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={2}>
                          {notification.subject ?? 'Notification'}
                        </Text>
                        {notification.body ? (
                          <Text style={styles.body} numberOfLines={2}>
                            {notification.body}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  markAll: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionLabel: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    backgroundColor: colors.card,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowUnread: { backgroundColor: colors.secondary },
  unreadBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  unreadSpacer: { width: 3 },
  copy: { flex: 1, minWidth: 0, paddingTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  typeLabel: { ...typography.tiny, fontFamily: fonts.bodySemi, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 },
  time: { ...typography.caption, color: colors.mutedForeground },
  subject: { ...typography.body, fontFamily: fonts.bodyMedium, color: colors.foreground, fontSize: 15 },
  subjectUnread: { fontFamily: fonts.bodySemi },
  body: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 },
  pressed: { opacity: 0.92 },
});
