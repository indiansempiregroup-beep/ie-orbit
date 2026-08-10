import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { PlatformAuditEvent } from '@ie-platform/sdk';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

export function PlatformAdminAuditScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const [events, setEvents] = useState<PlatformAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.platform.audit({ limit: 100 });
      setEvents(response.data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.action}</Text>
              <Text style={styles.meta}>
                {item.resource_type}
                {item.resource_id ? ` · ${item.resource_id}` : ''}
              </Text>
              {item.tenant_name || item.tenant_id ? (
                <Text style={styles.meta}>Tenant: {item.tenant_name || item.tenant_id}</Text>
              ) : null}
              {item.actor_email ? <Text style={styles.meta}>By {item.actor_email}</Text> : null}
              {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
              <Text style={styles.time}>{item.created_at}</Text>
            </View>
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState icon="shield" title="No audit events" message="Platform audit activity will show up here." />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 3,
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  reason: { color: colors.foreground, fontSize: 13, marginTop: 2 },
  time: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
