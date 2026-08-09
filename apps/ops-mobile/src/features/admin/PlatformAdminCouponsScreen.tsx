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
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

type CouponRow = {
  id: string;
  code: string;
  percent_off?: number | null;
  amount_off_paise?: number | null;
  is_active: boolean;
  redemption_count: number;
};

function couponDiscountLabel(coupon: CouponRow) {
  if (coupon.percent_off != null) return `${coupon.percent_off}% off`;
  if (coupon.amount_off_paise != null) return `₹${(coupon.amount_off_paise / 100).toFixed(2)} off`;
  return 'Custom discount';
}

export function PlatformAdminCouponsScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.platform.coupons();
      setCoupons(response.data.coupons ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
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
        data={coupons}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.code}</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: item.is_active ? colors.successSoft : colors.muted },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: item.is_active ? '#047857' : colors.mutedForeground },
                  ]}
                >
                  {item.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>{couponDiscountLabel(item)}</Text>
            <Text style={styles.meta}>{item.redemption_count} redemption{item.redemption_count === 1 ? '' : 's'}</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="tag" title="No coupons" message="Platform coupons will appear here when configured." />
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
    gap: 3,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
