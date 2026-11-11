import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        include_catalog: false,
        ...(dateFrom.trim() ? { date_from: dateFrom.trim() } : {}),
        ...(dateTo.trim() ? { date_to: dateTo.trim() } : {}),
      });
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.profit.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, dateFrom, dateTo, t]);

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
        {t('opsApp.shop.profit.help')}
        {activeBusiness?.display_name ? ` · ${activeBusiness.display_name}` : ''}
      </Text>

      <Input
        label={t('opsApp.shop.profit.salesFrom')}
        optional
        value={dateFrom}
        onChangeText={setDateFrom}
        placeholder="2026-01-01"
        autoCapitalize="none"
      />
      <Input
        label={t('opsApp.shop.profit.salesTo')}
        optional
        value={dateTo}
        onChangeText={setDateTo}
        placeholder="2026-12-31"
        autoCapitalize="none"
      />
      <Button label={t('opsApp.shop.profit.applyDates')} variant="secondary" onPress={() => void load()} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {summary ? (
        <View style={styles.summaryGrid}>
          {[
            [t('shop.productProfit.sumProducts'), String(summary.product_count)],
            [t('shop.productProfit.sumInventoryAtCost'), formatMoney(summary.inventory_at_cost, currency)],
            [t('shop.productProfit.sumPotentialProfit'), formatMoney(summary.potential_profit, currency)],
            [t('shop.productProfit.sumSalesRevenue'), formatMoney(summary.sales_revenue, currency)],
            [t('shop.productProfit.sumSalesCogs'), formatMoney(summary.sales_cogs, currency)],
            [t('shop.productProfit.sumGrossProfit'), formatMoney(summary.gross_profit, currency)],
          ].map(([label, value]) => (
            <View key={label} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>{t('shop.productProfit.catalogMargins')}</Text>
      {(topMargins.length ? topMargins : catalog.slice(0, 12)).map((row) => (
        <View key={row.product_id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{row.name}</Text>
          <Text style={styles.meta}>
            {t('opsApp.shop.profit.sellCost', { sell: formatMoney(row.price, currency), cost: formatMoney(row.purchase_price, currency) })}
          </Text>
          <Text style={styles.meta}>
            {t('opsApp.shop.profit.marginLine', { margin: formatMoney(row.margin, currency), percent: row.margin_percent, stock: row.stock_on_hand })}
          </Text>
        </View>
      ))}
      {!catalog.length ? (
        <Text style={styles.meta}>{t('shop.productProfit.emptyCatalog')}</Text>
      ) : null}

      <Text style={styles.section}>{t('shop.productProfit.soldProfit')}</Text>
      {sales.slice(0, 20).map((row) => (
        <View key={row.product_id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{row.name}</Text>
          <Text style={styles.meta}>
            {t('opsApp.shop.profit.soldRevenue', { units: row.units_sold, revenue: formatMoney(row.revenue, currency) })}
          </Text>
          <Text style={styles.meta}>
            {t('opsApp.shop.profit.cogsProfit', { cogs: formatMoney(row.cogs, currency), profit: formatMoney(row.gross_profit, currency) })}
          </Text>
        </View>
      ))}
      {!sales.length ? <Text style={styles.meta}>{t('shop.productProfit.emptySales')}</Text> : null}
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
