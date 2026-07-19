import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useNotifications } from '../../hooks/useOpsData';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';

export function NotificationsScreen() {
  const client = useOpsClient();
  const { notifications, loading, reload } = useNotifications();
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Alerts" subtitle="Business notifications" />
      <View style={styles.toolbar}>
        <Button
          label="Mark all read"
          variant="outline"
          onPress={async () => {
            if (!client) return;
            await client.notifications.readAll();
            await reload();
          }}
        />
      </View>
      <RefreshableScrollView refreshing={refreshing || loading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <ScreenState loading={loading && !notifications.length} empty={!loading && notifications.length === 0} emptyMessage="No alerts yet." />
        {notifications.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={async () => {
              if (!client || notification.is_read) return;
              await client.notifications.markRead(notification.id);
              await reload();
            }}
          >
            <Card style={!notification.is_read ? styles.unread : undefined}>
              <Text style={styles.subject}>{notification.subject ?? 'Notification'}</Text>
              <Text style={styles.body}>{notification.body ?? ''}</Text>
              <Text style={styles.time}>{formatRelativeTime(notification.created_at)}</Text>
            </Card>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  unread: { borderColor: colors.primary, backgroundColor: colors.secondary },
  subject: { ...typography.title, fontSize: 15, color: colors.foreground },
  body: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  time: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
});
