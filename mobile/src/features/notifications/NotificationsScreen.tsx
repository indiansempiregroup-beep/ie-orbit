import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { useMobileNotifications } from '../../hooks/useMobileNotifications';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

const iconMap = {
  booking: 'calendar',
  reminder: 'clock',
  review: 'star',
  cancel: 'x',
  payment: 'credit-card',
} as const;

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Alerts'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const { notifications, loading, error, reload, markAllRead, markRead } = useMobileNotifications();
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useFocusEffect(
    React.useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={() => void markAllRead()} disabled={!notifications.some((item) => !item.is_read)}>
          <Text style={[styles.markRead, { color: primary }]}>Mark all read</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <RefreshableScrollView
        style={styles.list}
        contentContainerStyle={!notifications.length ? styles.emptyContainer : undefined}
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        {!loading && !notifications.length ? (
          <View style={styles.empty}>
            <Feather name="bell" size={24} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No notifications yet. Updates about your bookings will appear here.</Text>
          </View>
        ) : null}

        {notifications.map((item) => {
          const type = (item.notification_type || 'booking') as keyof typeof iconMap;
          const icon = iconMap[type] ?? 'bell';
          return (
            <Pressable
              key={item.id}
              style={[styles.row, !item.is_read && styles.unread]}
              onPress={() => {
                if (!item.is_read) void markRead(item.id);
                if (item.booking_id) navigation.navigate('BookingDetail', { bookingId: item.booking_id });
                const petId = String((item as { pet_id?: string }).pet_id || '');
                if (petId) navigation.navigate('PetDetail', { petId });
              }}
            >
              <View style={[styles.iconWrap, type === 'review' ? styles.iconAmber : type === 'cancel' ? styles.iconRed : styles.iconBlue]}>
                <Feather
                  name={icon}
                  size={16}
                  color={type === 'review' ? colors.warning : type === 'cancel' ? colors.destructive : primary}
                />
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.rowTitle}>{item.subject || 'Notification'}</Text>
                  {!item.is_read ? <View style={[styles.dot, { backgroundColor: primary }]} /> : null}
                </View>
                <Text style={styles.rowBody}>{item.body || ''}</Text>
                <Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text>
              </View>
            </Pressable>
          );
        })}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 56,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
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
  error: { ...typography.caption, color: colors.destructive, padding: spacing.lg },
  emptyContainer: { flexGrow: 1 },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { ...typography.label, color: colors.foreground, fontWeight: '600', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  rowBody: { ...typography.caption, color: colors.mutedForeground, marginTop: 2, lineHeight: 18 },
  time: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
});
