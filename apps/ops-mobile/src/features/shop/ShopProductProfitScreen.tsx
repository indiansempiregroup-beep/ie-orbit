import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { ShopProductProfitInsights } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatMoney } from './shopBooksHelpers';

export function ShopProductProfitScreen() {
  const client = useOpsClient();
  const { businessId, activeBusiness } = useWorkspace();
  const currency = activeBusiness?.currency || 'INR';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShopProductProfitInsights | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.productProfitInsights({
        business_id: businessId,
        ...(dateFrom.trim() ? { date_from: dateFrom.trim() } : {}),
        ...(dateTo.trim() ? { date_to: dateTo.trim() } : {}),
      });
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profit insights');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, dateFrom, dateTo]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const summary = data?.summary;
  const catalog = data?.catalog ?? [];
  const sales = data?.sales ?? [];

  const topMargins = useMemo(
    () =>
      [...catalog]
        .filter((row) => Number(row.purchase_price) > 0)
        .sort((a, b) => Number(b.margin_percent) - Number(a.margin_percent))
        .slice(0, 12),
    [catalog],
  );

  if (loading && !refreshing && !data) {
    return (
      <DesktopPage>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </DesktopPage>
    );
  }

  return (
    <FormScreen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={styles.help}>
        Owner-only view using purchase price. Customers never see cost.
        {activeBusiness?.display_name ? ` · ${activeBusiness.display_name}` : ''}
      </Text>

      <Input
        label="Sales from (YYYY-MM-DD)"
        optional
        value={dateFrom}
        onChangeText={setDateFrom}
        placeholder="2026-01-01"
        autoCapitalize="none"
      />
      <Input
        label="Sales to (YYYY-MM-DD)"
        optional
        value={dateTo}
        onChangeText={setDateTo}
        placeholder="2026-12-31"
        autoCapitalize="none"
      />
      <Button label="Apply dates" variant="secondary" onPress={() => void load()} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {summary ? (
        <View style={styles.summaryGrid}>
          {[
            ['Products', String(summary.product_count)],
            ['Inventory at cost', formatMoney(summary.inventory_at_cost, currency)],
            ['Potential profit', formatMoney(summary.potential_profit, currency)],
            ['Sales revenue', formatMoney(summary.sales_revenue, currency)],
            ['Sales COGS', formatMoney(summary.sales_cogs, currency)],
            ['Gross profit', formatMoney(summary.gross_profit, currency)],
          ].map(([label, value]) => (
            <View key={label} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>Catalog margins</Text>
      {(topMargins.length ? topMargins : catalog.slice(0, 12)).map((row) => (
        <View key={row.product_id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{row.name}</Text>
          <Text style={styles.meta}>
            Sell {formatMoney(row.price, currency)} · Cost {formatMoney(row.purchase_price, currency)}
          </Text>
          <Text style={styles.meta}>
            Margin {formatMoney(row.margin, currency)} ({row.margin_percent}%) · Stock {row.stock_on_hand}
          </Text>
        </View>
      ))}
      {!catalog.length ? (
        <Text style={styles.meta}>Add purchase price on products to see margins.</Text>
      ) : null}

      <Text style={styles.section}>Sold profit</Text>
      {sales.slice(0, 20).map((row) => (
        <View key={row.product_id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{row.name}</Text>
          <Text style={styles.meta}>
            Sold {row.units_sold} · Revenue {formatMoney(row.revenue, currency)}
          </Text>
          <Text style={styles.meta}>
            COGS {formatMoney(row.cogs, currency)} · Profit {formatMoney(row.gross_profit, currency)}
          </Text>
        </View>
      ))}
      {!sales.length ? <Text style={styles.meta}>No sales in this period yet.</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  help: { ...typography.body, color: colors.mutedForeground },
  error: { color: colors.destructive },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  summaryGrid: { gap: spacing.sm },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tint,
    gap: 4,
  },
  summaryLabel: { color: colors.mutedForeground, fontSize: 13 },
  summaryValue: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.foreground },
  rowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
});
