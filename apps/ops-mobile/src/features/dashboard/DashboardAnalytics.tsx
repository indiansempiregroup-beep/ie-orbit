import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BIOverviewResponse, Booking, DashboardSummary, ShopBooksDashboard, ShopOrder } from '@ie-orbit/sdk';
import { colors, iconTones, spacing, typography } from '../../theme/tokens';
import { formatMoney } from '../shop/shopBooksHelpers';
import { BarChart } from '../../components/charts/BarChart';
import { ChartCard } from '../../components/charts/ChartCard';
import { ChartGrid } from '../../components/charts/ChartGrid';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineAreaChart } from '../../components/charts/LineAreaChart';
import { fillDailySeries, formatAxisValue } from '../../components/charts/chartUtils';

type Props = {
  bi: BIOverviewResponse | null;
  summary: DashboardSummary | null;
  books: ShopBooksDashboard | null;
  bookings: Booking[];
  shopOrders: ShopOrder[];
  hasAppointie: boolean;
  shopieEnabled: boolean;
  petsEnabled: boolean;
  showCashTiles: boolean;
  showPartyTiles: boolean;
  showReports: boolean;
  currency: string;
  onOpenBI?: () => void;
};

function moneyLabel(value: number, currency: string) {
  const amount = formatMoney(value);
  return currency ? `${currency} ${amount}` : amount;
}

export function DashboardAnalytics({
  bi,
  summary,
  books,
  bookings,
  shopOrders,
  hasAppointie,
  shopieEnabled,
  petsEnabled,
  showCashTiles,
  showPartyTiles,
  showReports,
  currency,
  onOpenBI,
}: Props) {
  const appointieBundle =
    bi?.appointie ??
    (bi?.summary && bi?.revenue && bi?.trends
      ? {
          summary: bi.summary,
          revenue: bi.revenue,
          trends: bi.trends,
          growth: bi.growth,
          operations: bi.operations,
          insights: bi.insights,
        }
      : null);
  const shopie = bi?.shopie;
  const resolvedCurrency = currency || appointieBundle?.revenue?.currency || shopie?.currency || summary?.currency || '';

  const bookingTrend = useMemo(
    () =>
      fillDailySeries(
        (appointieBundle?.trends?.rows ?? []).map((row) => ({ day: row.day, value: row.total })),
      ),
    [appointieBundle?.trends?.rows],
  );
  const gmvTrend = useMemo(
    () =>
      fillDailySeries((shopie?.trend ?? []).map((row) => ({ day: row.day, value: Number(row.gmv || 0) }))),
    [shopie?.trend],
  );

  const weekdayBars = useMemo(() => {
    const busiest = appointieBundle?.operations?.busiest_day;
    return (appointieBundle?.operations?.by_weekday ?? []).map((row) => ({
      label: row.weekday_name.slice(0, 3),
      value: row.total,
      highlight: busiest === row.weekday_name,
    }));
  }, [appointieBundle?.operations]);

  const bookingMix = useMemo(() => {
    const stats = appointieBundle?.summary;
    if (stats && stats.bookings > 0) {
      const other = Math.max(
        0,
        stats.bookings - (stats.completed ?? 0) - (stats.cancelled ?? 0) - (stats.no_shows ?? 0),
      );
      return [
        { label: 'Completed', value: stats.completed ?? 0, color: iconTones.green.foreground },
        { label: 'Cancelled', value: stats.cancelled ?? 0, color: iconTones.rose.foreground },
        { label: 'No-show', value: stats.no_shows ?? 0, color: iconTones.coral.foreground },
        { label: 'Open', value: other, color: iconTones.blue.foreground },
      ].filter((slice) => slice.value > 0);
    }
    if (!bookings.length) return [];
    const counts = { completed: 0, cancelled: 0, no_show: 0, open: 0 };
    for (const booking of bookings) {
      const status = String(booking.status || '').toLowerCase();
      if (status === 'completed') counts.completed += 1;
      else if (status === 'cancelled') counts.cancelled += 1;
      else if (status === 'no_show' || status === 'no-show') counts.no_show += 1;
      else counts.open += 1;
    }
    return [
      { label: 'Completed', value: counts.completed, color: iconTones.green.foreground },
      { label: 'Cancelled', value: counts.cancelled, color: iconTones.rose.foreground },
      { label: 'No-show', value: counts.no_show, color: iconTones.coral.foreground },
      { label: 'Open', value: counts.open, color: iconTones.blue.foreground },
    ].filter((slice) => slice.value > 0);
  }, [appointieBundle?.summary, bookings]);

  const serviceMix = useMemo(() => {
    const rows = (appointieBundle?.revenue?.by_service ?? []).filter((row) => Number(row.revenue) > 0).slice(0, 5);
    const palette = [
      iconTones.blue.foreground,
      iconTones.violet.foreground,
      iconTones.cyan.foreground,
      iconTones.amber.foreground,
      iconTones.coral.foreground,
    ];
    return rows.map((row, index) => ({
      label: row.service_name || 'Service',
      value: Number(row.revenue),
      color: palette[index % palette.length],
    }));
  }, [appointieBundle?.revenue?.by_service]);

  const growthMix = useMemo(() => {
    const growth = appointieBundle?.growth;
    if (!growth) return [];
    return [
      { label: 'New', value: growth.new_customers ?? 0, color: iconTones.cyan.foreground },
      { label: 'Returning', value: growth.returning_customers ?? 0, color: iconTones.violet.foreground },
    ].filter((slice) => slice.value > 0);
  }, [appointieBundle?.growth]);

  const orderMix = useMemo(() => {
    if (shopie && (shopie.orders > 0 || shopie.cancelled_orders > 0 || shopie.returns > 0)) {
      return [
        { label: 'Orders', value: shopie.orders, color: iconTones.green.foreground },
        { label: 'Cancelled', value: shopie.cancelled_orders, color: iconTones.rose.foreground },
        { label: 'Returns', value: shopie.returns, color: iconTones.coral.foreground },
      ].filter((slice) => slice.value > 0);
    }
    if (!shopOrders.length) return [];
    const counts = { open: 0, completed: 0, cancelled: 0 };
    for (const order of shopOrders) {
      const status = String(order.status || '').toLowerCase();
      if (status === 'cancelled') counts.cancelled += 1;
      else if (status === 'completed' || status === 'delivered') counts.completed += 1;
      else counts.open += 1;
    }
    return [
      { label: 'Open', value: counts.open, color: iconTones.amber.foreground },
      { label: 'Fulfilled', value: counts.completed, color: iconTones.green.foreground },
      { label: 'Cancelled', value: counts.cancelled, color: iconTones.rose.foreground },
    ].filter((slice) => slice.value > 0);
  }, [shopie, shopOrders]);

  const cashMix = useMemo(() => {
    if (!books || !showCashTiles) return [];
    return [
      { label: 'Cash', value: Number(books.cash || 0), color: iconTones.amber.foreground },
      { label: 'Bank', value: Number(books.bank || 0), color: iconTones.violet.foreground },
    ].filter((slice) => slice.value > 0);
  }, [books, showCashTiles]);

  const partyMix = useMemo(() => {
    if (!books || !showPartyTiles) return [];
    return [
      { label: 'To collect', value: Number(books.to_collect || 0), color: iconTones.green.foreground },
      { label: 'To pay', value: Number(books.to_pay || 0), color: iconTones.rose.foreground },
    ].filter((slice) => slice.value > 0);
  }, [books, showPartyTiles]);

  const petsMix = useMemo(() => {
    const pets = summary?.pets ?? bi?.pets;
    if (!pets || !pets.total) return [];
    const withPhoto = pets.with_photo ?? 0;
    return [
      { label: 'With photo', value: withPhoto, color: iconTones.rose.foreground },
      { label: 'No photo', value: Math.max(0, pets.total - withPhoto), color: colors.muted },
    ];
  }, [summary?.pets, bi?.pets]);

  const bookingTrendTotal = bookingTrend.reduce((sum, row) => sum + row.value, 0);
  const gmvTrendTotal = gmvTrend.reduce((sum, row) => sum + row.value, 0);
  const hasAnyChart =
    (hasAppointie && (bookingTrendTotal > 0 || bookingMix.length > 0 || weekdayBars.some((row) => row.value > 0))) ||
    (shopieEnabled && (gmvTrendTotal > 0 || orderMix.length > 0)) ||
    cashMix.length > 0 ||
    partyMix.length > 0 ||
    (petsEnabled && petsMix.length > 0);

  if (!hasAnyChart) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Business snapshot</Text>
        <Text style={styles.sectionHint}>Last 30 days · trends owners actually use</Text>
      </View>

      {hasAppointie && bookingTrendTotal > 0 ? (
        <ChartCard
          title="Bookings over time"
          subtitle={`${formatAxisValue(bookingTrendTotal)} in 30 days`}
          onPress={showReports ? onOpenBI : undefined}
          actionLabel="View BI"
        >
          <LineAreaChart data={bookingTrend} color={iconTones.blue.foreground} unit="bookings" />
        </ChartCard>
      ) : null}

      {shopieEnabled && gmvTrendTotal > 0 ? (
        <ChartCard
          title="Sales (GMV)"
          subtitle={moneyLabel(shopie?.gmv ?? gmvTrendTotal, resolvedCurrency)}
          onPress={showReports ? onOpenBI : undefined}
          actionLabel="View BI"
        >
          <LineAreaChart
            data={gmvTrend}
            color={iconTones.green.foreground}
            formatValue={(value) => formatMoney(value)}
            unit={resolvedCurrency}
          />
        </ChartCard>
      ) : null}

      <ChartGrid>
        {hasAppointie && bookingMix.length ? (
          <ChartCard title="Booking mix" subtitle={appointieBundle ? 'Outcomes this period' : 'Today'}>
            <DonutChart
              data={bookingMix}
              centerValue={String(bookingMix.reduce((sum, slice) => sum + slice.value, 0))}
              centerLabel="bookings"
            />
          </ChartCard>
        ) : null}

        {hasAppointie && weekdayBars.some((row) => row.value > 0) ? (
          <ChartCard
            title="Demand by weekday"
            subtitle={
              appointieBundle?.operations?.busiest_day
                ? `Busiest: ${appointieBundle.operations.busiest_day}`
                : 'Plan staffing around peak days'
            }
          >
            <BarChart data={weekdayBars} unit="bookings" />
          </ChartCard>
        ) : null}

        {hasAppointie && serviceMix.length ? (
          <ChartCard title="Revenue by service" subtitle="Top services · 30 days">
            <DonutChart
              data={serviceMix}
              centerValue={formatAxisValue(serviceMix.reduce((sum, slice) => sum + slice.value, 0))}
              centerLabel={resolvedCurrency || 'rev'}
              formatValue={formatAxisValue}
            />
          </ChartCard>
        ) : null}

        {hasAppointie && growthMix.length ? (
          <ChartCard
            title="Customers"
            subtitle={
              appointieBundle?.growth?.repeat_rate != null
                ? `${Math.round(appointieBundle.growth.repeat_rate * 100)}% repeat`
                : 'New vs returning'
            }
          >
            <DonutChart
              data={growthMix}
              centerValue={String(growthMix.reduce((sum, slice) => sum + slice.value, 0))}
              centerLabel="active"
            />
          </ChartCard>
        ) : null}

        {shopieEnabled && orderMix.length ? (
          <ChartCard title="Order mix" subtitle={shopie ? 'Last 30 days' : 'Current pipeline'}>
            <DonutChart
              data={orderMix}
              centerValue={String(orderMix.reduce((sum, slice) => sum + slice.value, 0))}
              centerLabel="orders"
            />
          </ChartCard>
        ) : null}

        {cashMix.length ? (
          <ChartCard title="Cash & bank" subtitle="Liquidity on hand">
            <DonutChart
              data={cashMix.map((slice) => ({ ...slice, value: Math.round(slice.value) }))}
              centerLabel={resolvedCurrency || 'total'}
              centerValue={formatAxisValue(cashMix.reduce((sum, slice) => sum + slice.value, 0))}
              formatValue={formatAxisValue}
            />
          </ChartCard>
        ) : null}

        {partyMix.length ? (
          <ChartCard title="Receivable vs payable" subtitle="Who owes whom">
            <DonutChart
              data={partyMix.map((slice) => ({ ...slice, value: Math.round(slice.value) }))}
              centerLabel={resolvedCurrency || 'total'}
              centerValue={formatAxisValue(partyMix.reduce((sum, slice) => sum + slice.value, 0))}
              formatValue={formatAxisValue}
            />
          </ChartCard>
        ) : null}

        {petsEnabled && petsMix.length ? (
          <ChartCard
            title="Pets"
            subtitle={`${summary?.pets?.birthdays_next_7d ?? bi?.pets?.birthdays_next_7d ?? 0} birthdays in 7 days`}
          >
            <DonutChart
              data={petsMix}
              centerValue={String(summary?.pets?.total ?? bi?.pets?.total ?? 0)}
              centerLabel="pets"
            />
          </ChartCard>
        ) : null}
      </ChartGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  sectionHead: { gap: 2 },
  sectionTitle: { ...typography.title, fontSize: 19, color: colors.foreground },
  sectionHint: { ...typography.caption, color: colors.mutedForeground },
});
