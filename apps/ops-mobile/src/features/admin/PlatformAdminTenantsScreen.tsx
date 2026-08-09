import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { PlatformTenantSummary } from '@ie-platform/sdk';
import { voucherStatusStyle } from '../shop/shopBooksHelpers';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

export function PlatformAdminTenantsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.platform.tenants();
      setTenants(response.data.tenants ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants');
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
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={tenants}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        renderItem={({ item }) => {
          const badge = voucherStatusStyle(item.status);
          return (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('PlatformAdminTenantDetail', { tenantId: item.id })}
            >
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.display_name}</Text>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {item.slug} · {item.business_count} business{item.business_count === 1 ? '' : 'es'}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="briefcase" title="No tenants" message="No tenants were returned by the platform API." />
          ) : null
        }
      />
    </View>
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
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
