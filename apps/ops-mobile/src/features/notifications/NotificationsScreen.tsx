import React, { useCallback, useLayoutEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Notification } from '@ie-orbit/sdk';
import { Feather } from '@expo/vector-icons';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useNotifications } from '../../contexts/NotificationsContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

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
  }
}

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { notifications, loading, reload, markRead, markAllRead, unreadCount } = useNotifications();
  const { activeBusiness } = useWorkspace();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const hasUnread = unreadCount > 0;
  const logo = activeBusiness?.logo;
  const businessName = activeBusiness?.display_name || activeBusiness?.business_name || 'Business';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          disabled={!hasUnread}
          onPress={() => void markAllRead()}
          hitSlop={8}
          style={styles.markReadHit}
        >
          <Text style={[styles.markRead, !hasUnread && styles.markReadDisabled]}>Mark all read</Text>
        </Pressable>
      ),
    });
  }, [hasUnread, markAllRead, navigation]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <DesktopPage>
      <RefreshableScrollView refreshing={refreshing || loading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <ScreenState
          loading={loading && !notifications.length}
          empty={!loading && notifications.length === 0}
          emptyMessage="No alerts yet."
        />
        {notifications.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={() => {
              if (!notification.is_read) void markRead(notification.id);
              openRelatedItem(navigation, notification);
            }}
          >
            <View style={[styles.card, !notification.is_read && styles.unread]}>
              <View style={styles.row}>
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.logo} />
                ) : (
                  <View style={styles.logoFallback}>
                    <Text style={styles.logoInitial}>{businessName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.copy}>
                  <Text style={styles.brand}>{businessName}</Text>
                  <Text style={styles.subject}>{notification.subject ?? 'Notification'}</Text>
                  <Text style={styles.body} numberOfLines={3}>
                    {notification.body ?? ''}
                  </Text>
                  <View style={styles.footer}>
                    <Text style={styles.time}>{formatRelativeTime(notification.created_at)}</Text>
                    {!notification.is_read ? (
                      <View style={styles.dotRow}>
                        <View style={styles.dot} />
                        <Text style={styles.unreadLabel}>New</Text>
                      </View>
                    ) : (
                      <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                    )}
                  </View>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  markReadHit: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  markRead: { ...typography.caption, fontWeight: '600', color: colors.primary },
  markReadDisabled: { opacity: 0.45 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  unread: { borderColor: colors.primary, backgroundColor: colors.secondary },
  row: { flexDirection: 'row', gap: spacing.md },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.tint },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.primary },
  copy: { flex: 1, minWidth: 0 },
  brand: { ...typography.tiny, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  subject: { ...typography.title, fontSize: 15, color: colors.foreground, marginTop: 2 },
  body: { ...typography.body, color: colors.mutedForeground, marginTop: 4, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  time: { ...typography.caption, color: colors.mutedForeground },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  unreadLabel: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
});
