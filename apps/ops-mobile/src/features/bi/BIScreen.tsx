import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { BarChart } from '../../components/charts/BarChart';
import { ChartCard } from '../../components/charts/ChartCard';
import { ChartGrid } from '../../components/charts/ChartGrid';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineAreaChart } from '../../components/charts/LineAreaChart';
import { fillDailySeries, formatAxisValue } from '../../components/charts/chartUtils';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import {
  useBIForecast,
  useBIGrowth,
  useBIOverview,
  useBIReports,
  useBIRevenue,
  useBusinessBillingSnapshot,
} from '../../hooks/useOpsExtended';
import { getSubscribedProductIds } from '../../utils/products';
import { colors, fonts, iconTones, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { InsightPanel } from './InsightPanel';

type Tab = 'overview' | 'growth' | 'revenue' | 'forecast' | 'reports';

const TAB_META: Record<
  Tab,
  { label: string; icon: keyof typeof Feather.glyphMap; hint: string }
> = {
  overview: { label: 'Overview', icon: 'pie-chart', hint: 'Snapshot' },
  growth: { label: 'Growth', icon: 'users', hint: 'Customers' },
  revenue: { label: 'Revenue', icon: 'dollar-sign', hint: 'Earnings' },
  forecast: { label: 'Forecast', icon: 'trending-up', hint: 'Next 30 days' },
  reports: { label: 'Reports', icon: 'file-text', hint: 'Operations' },
};

const APPOINTIE_ONLY_TABS: Tab[] = ['growth', 'revenue', 'forecast', 'reports'];

function pct(value?: number | null) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function changeLabel(value?: number | null) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}% vs prior`;
}

function money(amount?: number | null, currency?: string | null) {
  if (amount == null) return '—';
  return `${currency ?? ''} ${Number(amount).toFixed(2)}`.trim();
}

function appointieFromOverview(data: ReturnType<typeof useBIOverview>['data']) {
  return (
    data?.appointie ??
    (data?.summary && data?.revenue && data?.trends
      ? {
          summary: data.summary,
          revenue: data.revenue,
          trends: data.trends,
          growth: data.growth,
          operations: data.operations,
          insights: data.insights,
        }
      : null)
  );
}

export function BIScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BI'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeBusiness } = useWorkspace();
  const { billing } = useBusinessBillingSnapshot();
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const hasAppointie = subscribedIds.includes('appointie') || subscribedIds.length === 0;
  const allowed = useMemo(
    () => new Set(billing?.bi_features?.length ? billing.bi_features : ['overview']),
    [billing?.bi_features],
  );
  const visibleTabs = useMemo(
    () => (Object.keys(TAB_META) as Tab[]).filter((key) => !APPOINTIE_ONLY_TABS.includes(key) || hasAppointie),
    [hasAppointie],
  );
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'overview');
  const overview = useBIOverview();
  const growth = useBIGrowth();
  const revenue = useBIRevenue();
  const forecast = useBIForecast();
  const reports = useBIReports();

  useEffect(() => {
    if (route.params?.tab && visibleTabs.includes(route.params.tab) && allowed.has(route.params.tab)) {
      setTab(route.params.tab);
    }
  }, [allowed, route.params?.tab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab('overview');
  }, [tab, visibleTabs]);

  const reload = async () => {
    await Promise.all([
      overview.reload(),
      growth.reload(),
      revenue.reload(),
      forecast.reload(),
      reports.reload(),
    ]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const loading =
    overview.loading || growth.loading || revenue.loading || forecast.loading || reports.loading;
  const { isDesktop } = useBreakpoint();
  const tabLocked = !allowed.has(tab);

  return (
    <DesktopPage>
      <BITabBar
        tabs={visibleTabs}
        active={tab}
        allowed={allowed}
        isDesktop={isDesktop}
        onChange={setTab}
      />
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {tabLocked ? (
          <Card style={styles.lockCard}>
            <Text style={styles.lockTitle}>{TAB_META[tab].label} is on Pro</Text>
            <Text style={styles.lockMeta}>
              Overview is included on your current plan. Upgrade to unlock Growth, Revenue, Forecast, and Reports.
            </Text>
            <Pressable style={styles.lockCta} onPress={() => navigation.navigate('ProductSettings')}>
              <Text style={styles.lockCtaText}>Upgrade plan</Text>
            </Pressable>
          </Card>
        ) : null}
        {!tabLocked && tab === 'overview' ? <BIOverview data={overview.data} loading={overview.loading} /> : null}
        {!tabLocked && tab === 'growth' ? <BIGrowth data={growth.data} loading={growth.loading} /> : null}
        {!tabLocked && tab === 'revenue' ? <BIRevenue data={revenue.data} loading={revenue.loading} /> : null}
        {!tabLocked && tab === 'forecast' ? (
          <BIForecast
            data={forecast.data}
            loading={forecast.loading}
            recentBookings={appointieFromOverview(overview.data)?.summary?.bookings}
          />
        ) : null}
        {!tabLocked && tab === 'reports' ? <BIReports data={reports.data} loading={reports.loading} /> : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

function BITabBar({
  tabs,
  active,
  allowed,
  isDesktop,
  onChange,
}: {
  tabs: Tab[];
  active: Tab;
  allowed: Set<string>;
  isDesktop: boolean;
  onChange: (tab: Tab) => void;
}) {
  const buttons = tabs.map((key) => {
    const meta = TAB_META[key];
    const locked = !allowed.has(key);
    const selected = active === key;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: false }}
        accessibilityLabel={locked ? `${meta.label}, Pro` : meta.label}
        style={({ pressed }) => [
          styles.tabBtn,
          isDesktop && styles.tabBtnDesktop,
          selected && styles.tabBtnActive,
          locked && !selected && styles.tabBtnLocked,
          pressed && styles.tabBtnPressed,
        ]}
      >
        <View style={[styles.tabIconWrap, selected && styles.tabIconWrapActive]}>
          <Feather name={meta.icon} size={15} color={selected ? colors.primaryForeground : colors.primary} />
        </View>
        <View style={styles.tabCopy}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]} numberOfLines={1}>
              {meta.label}
            </Text>
            {locked ? <Feather name="lock" size={11} color={selected ? colors.primaryForeground : colors.mutedForeground} /> : null}
          </View>
          <Text style={[styles.tabHint, selected && styles.tabHintActive]} numberOfLines={1}>
            {locked ? 'Pro' : meta.hint}
          </Text>
        </View>
      </Pressable>
    );
  });

  if (isDesktop) {
    return (
      <View style={styles.tabBar} accessibilityRole="tablist">
        <View style={styles.tabTrack}>{buttons}</View>
      </View>
    );
  }

  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {buttons}
      </ScrollView>
    </View>
  );
}

function BIOverview({ data, loading }: { data: ReturnType<typeof useBIOverview>['data']; loading: boolean }) {
  const appointieBundle = appointieFromOverview(data);
  const shopie = data?.shopie;
  const pets = data?.pets;
  const summary = appointieBundle?.summary;
  const comparison = summary?.comparison;
  const currency = appointieBundle?.revenue?.currency ?? shopie?.currency ?? data?.currency ?? '';

  const bookingTrend = useMemo(
    () =>
      fillDailySeries((appointieBundle?.trends?.rows ?? []).map((row) => ({ day: row.day, value: row.total }))),
    [appointieBundle?.trends?.rows],
  );
  const gmvTrend = useMemo(
    () => fillDailySeries((shopie?.trend ?? []).map((row) => ({ day: row.day, value: Number(row.gmv || 0) }))),
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
    if (!summary || !summary.bookings) return [];
    const other = Math.max(
      0,
      summary.bookings - (summary.completed ?? 0) - (summary.cancelled ?? 0) - (summary.no_shows ?? 0),
    );
    return [
      { label: 'Completed', value: summary.completed ?? 0, color: iconTones.green.foreground },
      { label: 'Cancelled', value: summary.cancelled ?? 0, color: iconTones.rose.foreground },
      { label: 'No-show', value: summary.no_shows ?? 0, color: iconTones.coral.foreground },
      { label: 'Open', value: other, color: iconTones.blue.foreground },
    ].filter((slice) => slice.value > 0);
  }, [summary]);
  const serviceMix = useMemo(() => {
    const palette = [
      iconTones.blue.foreground,
      iconTones.violet.foreground,
      iconTones.cyan.foreground,
      iconTones.amber.foreground,
      iconTones.coral.foreground,
    ];
    return (appointieBundle?.revenue?.by_service ?? [])
      .filter((row) => Number(row.revenue) > 0)
      .slice(0, 5)
      .map((row, index) => ({
        label: row.service_name || 'Service',
        value: Number(row.revenue),
        color: palette[index % palette.length],
      }));
  }, [appointieBundle?.revenue?.by_service]);
  const staffBars = useMemo(
    () =>
      (appointieBundle?.operations?.by_staff ?? []).slice(0, 7).map((row, index) => ({
        label: row.staff_name.split(' ')[0] || row.staff_name,
        value: row.bookings,
        highlight: index === 0,
      })),
    [appointieBundle?.operations?.by_staff],
  );
  const orderMix = useMemo(() => {
    if (!shopie) return [];
    return [
      { label: 'Orders', value: shopie.orders, color: iconTones.green.foreground },
      { label: 'Cancelled', value: shopie.cancelled_orders, color: iconTones.rose.foreground },
      { label: 'Returns', value: shopie.returns, color: iconTones.coral.foreground },
    ].filter((slice) => slice.value > 0);
  }, [shopie]);
  const highlights = useMemo(
    () => [...(appointieBundle?.insights ?? []), ...(shopie?.insights ?? [])],
    [appointieBundle?.insights, shopie?.insights],
  );

  if (loading && !data) return <ScreenState loading />;

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>Last 30 days</Text>
        <Text style={styles.heroHint}>
          Hover or tap a chart to see the exact count. {data?.products?.length ? data.products.join(' · ') : ''}
        </Text>
      </View>

      {appointieBundle ? (
        <>
          <TileGrid gap={spacing.md}>
            <StatTile
              label="Bookings"
              value={String(summary?.bookings ?? 0)}
              hint={changeLabel(comparison?.bookings_change_pct)}
              icon="calendar"
              iconTone="blue"
            />
            <StatTile
              label="Est. revenue"
              value={money(appointieBundle.revenue?.estimated_revenue, currency)}
              hint={changeLabel(comparison?.revenue_change_pct)}
              icon="trending-up"
              iconTone="green"
            />
            <StatTile
              label="Completed"
              value={String(summary?.completed ?? 0)}
              hint={pct(summary?.completion_rate)}
              icon="check-circle"
              iconTone="green"
            />
            <StatTile
              label="Avg / day"
              value={String(summary?.avg_bookings_per_day ?? 0)}
              hint={appointieBundle.operations?.busiest_day ? `Peak ${appointieBundle.operations.busiest_day}` : undefined}
              icon="activity"
              iconTone="violet"
            />
          </TileGrid>
        </>
      ) : null}

      {shopie ? (
        <>
          {appointieBundle ? <Text style={styles.section}>Orbit Mart</Text> : null}
          <TileGrid gap={spacing.md}>
            <StatTile label="Orders" value={String(shopie.orders)} icon="shopping-bag" iconTone="green" />
            <StatTile label="GMV" value={money(shopie.gmv, shopie.currency)} icon="dollar-sign" iconTone="green" />
            <StatTile
              label="Avg order"
              value={money(shopie.avg_order_value, shopie.currency)}
              icon="tag"
              iconTone="amber"
            />
            <StatTile
              label="Returns"
              value={String(shopie.returns)}
              hint={pct(shopie.return_rate)}
              icon="rotate-ccw"
              iconTone="coral"
            />
          </TileGrid>
        </>
      ) : null}

      <InsightPanel
        title="What stands out"
        subtitle="Signals from the last 30 days — what to act on next."
        insights={highlights}
      />

      {appointieBundle ? (
        <>
          {bookingTrend.some((row) => row.value > 0) ? (
            <ChartCard title="Bookings over time" subtitle="Daily volume · hover a day for the count">
              <LineAreaChart data={bookingTrend} color={iconTones.blue.foreground} unit="bookings" />
            </ChartCard>
          ) : null}

          <ChartGrid>
            {bookingMix.length ? (
              <ChartCard title="Booking mix" subtitle="Outcomes this period">
                <DonutChart data={bookingMix} centerLabel="bookings" />
              </ChartCard>
            ) : null}
            {weekdayBars.some((row) => row.value > 0) ? (
              <ChartCard title="Demand by weekday" subtitle="Plan staffing around busy days">
                <BarChart data={weekdayBars} unit="bookings" />
              </ChartCard>
            ) : null}
            {serviceMix.length ? (
              <ChartCard title="Revenue by service" subtitle="Top services">
                <DonutChart data={serviceMix} centerLabel={currency || 'rev'} formatValue={formatAxisValue} />
              </ChartCard>
            ) : null}
            {staffBars.length ? (
              <ChartCard title="Top staff" subtitle="Bookings this period">
                <BarChart data={staffBars} unit="bookings" />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}

      {shopie ? (
        <>
          {gmvTrend.some((row) => row.value > 0) ? (
            <ChartCard title="Sales (GMV)" subtitle="Daily sales · hover a day for the amount">
              <LineAreaChart
                data={gmvTrend}
                color={iconTones.green.foreground}
                formatValue={(value) => Number(value).toFixed(2)}
                unit={shopie.currency ?? currency}
              />
            </ChartCard>
          ) : null}
          {orderMix.length ? (
            <ChartCard title="Order mix" subtitle="Orders, cancellations, and returns">
              <DonutChart data={orderMix} centerLabel="orders" />
            </ChartCard>
          ) : null}
        </>
      ) : null}

      {pets ? (
        <ChartCard title="Pets pack" subtitle={`${pets.birthdays_next_7d} birthdays in 7 days`}>
          <DonutChart
            data={[
              { label: 'With photo', value: pets.with_photo, color: iconTones.rose.foreground },
              { label: 'No photo', value: Math.max(0, pets.total - pets.with_photo), color: colors.muted },
            ]}
            centerValue={String(pets.total)}
            centerLabel="pets"
          />
        </ChartCard>
      ) : null}

      {!appointieBundle && !shopie && !pets ? (
        <Card>
          <Text style={styles.empty}>No analytics sections available for your subscribed products yet.</Text>
        </Card>
      ) : null}
    </View>
  );
}

function BIGrowth({ data, loading }: { data: ReturnType<typeof useBIGrowth>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const mix = [
    { label: 'New', value: data?.new_customers ?? 0, color: iconTones.cyan.foreground },
    { label: 'Returning', value: data?.returning_customers ?? 0, color: iconTones.violet.foreground },
  ].filter((slice) => slice.value > 0);
  const customerBars = (data?.top_customers ?? []).slice(0, 7).map((row, index) => ({
    label: row.customer_name.split(' ')[0] || row.customer_name,
    value: row.bookings,
    highlight: index === 0,
  }));

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>Customer growth</Text>
        <Text style={styles.heroHint}>Who is booking — and who comes back.</Text>
      </View>
      <TileGrid gap={spacing.md}>
        <StatTile label="New" value={String(data?.new_customers ?? 0)} icon="user-plus" iconTone="cyan" />
        <StatTile label="Returning" value={String(data?.returning_customers ?? 0)} icon="refresh-cw" iconTone="violet" />
        <StatTile label="Repeat rate" value={pct(data?.repeat_rate)} icon="repeat" iconTone="green" />
        <StatTile label="Avg visits" value={String(data?.avg_visits_per_customer ?? 0)} icon="layers" iconTone="blue" />
      </TileGrid>
      <ChartGrid>
        {mix.length ? (
          <ChartCard title="New vs returning" subtitle="Hover a slice for the count">
            <DonutChart data={mix} centerLabel="customers" />
          </ChartCard>
        ) : null}
        {customerBars.length ? (
          <ChartCard title="Most active customers" subtitle="Bookings this period">
            <BarChart data={customerBars} unit="bookings" />
          </ChartCard>
        ) : null}
      </ChartGrid>
      {!customerBars.length ? (
        <Card>
          <Text style={styles.empty}>No customer booking activity in this period yet.</Text>
        </Card>
      ) : null}
    </View>
  );
}

function BIRevenue({ data, loading }: { data: ReturnType<typeof useBIRevenue>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const palette = [
    iconTones.blue.foreground,
    iconTones.violet.foreground,
    iconTones.cyan.foreground,
    iconTones.amber.foreground,
    iconTones.coral.foreground,
    iconTones.green.foreground,
  ];
  const mix = (data?.by_service ?? [])
    .filter((row) => Number(row.revenue) > 0)
    .slice(0, 6)
    .map((row, index) => ({
      label: row.service_name || 'Service',
      value: Number(row.revenue),
      color: palette[index % palette.length],
    }));
  const bars = (data?.by_service ?? []).slice(0, 7).map((row, index) => ({
    label: (row.service_name || 'Service').slice(0, 10),
    value: Number(row.revenue),
    highlight: index === 0,
  }));

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>Revenue</Text>
        <Text style={styles.heroHint}>Estimated from service list prices × bookings.</Text>
      </View>
      <TileGrid gap={spacing.md}>
        <StatTile
          label="Estimated"
          value={money(data?.estimated_revenue, data?.currency)}
          icon="dollar-sign"
          iconTone="green"
        />
        <StatTile
          label="Completed"
          value={money(data?.completed_revenue, data?.currency)}
          icon="check-circle"
          iconTone="green"
        />
        <StatTile
          label="Avg booking"
          value={money(data?.avg_booking_value, data?.currency)}
          icon="tag"
          iconTone="amber"
        />
      </TileGrid>
      <ChartGrid>
        {mix.length ? (
          <ChartCard title="Mix by service" subtitle="Hover a slice for the amount">
            <DonutChart data={mix} centerLabel={data?.currency || 'rev'} formatValue={formatAxisValue} />
          </ChartCard>
        ) : null}
        {bars.length ? (
          <ChartCard title="Top services" subtitle="Estimated revenue">
            <BarChart data={bars} formatValue={formatAxisValue} unit={data?.currency} />
          </ChartCard>
        ) : null}
      </ChartGrid>
    </View>
  );
}

function BIForecast({
  data,
  loading,
  recentBookings,
}: {
  data: ReturnType<typeof useBIForecast>['data'];
  loading: boolean;
  recentBookings?: number;
}) {
  if (loading && !data) return <ScreenState loading />;
  const bookingCompare = [
    { label: 'Last 30d', value: recentBookings ?? data?.based_on_bookings ?? 0 },
    { label: 'Next 30d', value: data?.projected_bookings ?? 0, highlight: true },
  ];
  const revenueCompare = [
    {
      label: 'Avg / day',
      value: Number(data?.avg_daily_revenue ?? 0),
    },
    {
      label: 'Projected',
      value: Number(data?.projected_revenue ?? 0),
      highlight: true,
    },
  ];

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{`Next ${data?.horizon_days ?? 30} days`}</Text>
        <Text style={styles.heroHint}>
          Based on the last {data?.based_on_days ?? 30} days ({data?.based_on_bookings ?? 0} bookings).
        </Text>
      </View>
      <TileGrid gap={spacing.md}>
        <StatTile
          label="Projected bookings"
          value={String(data?.projected_bookings ?? 0)}
          icon="calendar"
          iconTone="blue"
        />
        <StatTile
          label="Projected revenue"
          value={money(data?.projected_revenue, data?.currency)}
          icon="dollar-sign"
          iconTone="green"
        />
        <StatTile
          label="Avg daily bookings"
          value={String(data?.avg_daily_bookings ?? 0)}
          icon="activity"
          iconTone="violet"
        />
        <StatTile
          label="Avg daily revenue"
          value={money(data?.avg_daily_revenue, data?.currency)}
          icon="trending-up"
          iconTone="green"
        />
      </TileGrid>
      <ChartGrid>
        <ChartCard title="Bookings outlook" subtitle="Hover a bar for the count">
          <BarChart data={bookingCompare} unit="bookings" />
        </ChartCard>
        <ChartCard title="Revenue outlook" subtitle="Hover a bar for the amount">
          <BarChart data={revenueCompare} formatValue={formatAxisValue} unit={data?.currency} />
        </ChartCard>
      </ChartGrid>
    </View>
  );
}

function BIReports({ data, loading }: { data: ReturnType<typeof useBIReports>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const summary = data?.summary;
  const trend = fillDailySeries((data?.trends?.rows ?? []).map((row) => ({ day: row.day, value: row.total })));
  const mix = summary
    ? [
        { label: 'Completed', value: summary.completed ?? 0, color: iconTones.green.foreground },
        { label: 'Cancelled', value: summary.cancelled ?? 0, color: iconTones.rose.foreground },
        { label: 'No-show', value: summary.no_shows ?? 0, color: iconTones.coral.foreground },
      ].filter((slice) => slice.value > 0)
    : [];

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>Operations report</Text>
        <Text style={styles.heroHint}>Combined summary for the last 30 days.</Text>
      </View>
      <TileGrid gap={spacing.md}>
        <StatTile label="Bookings" value={String(summary?.bookings ?? 0)} icon="calendar" iconTone="blue" />
        <StatTile label="Completion" value={pct(summary?.completion_rate)} icon="check-circle" iconTone="green" />
        <StatTile
          label="Est. revenue"
          value={money(data?.revenue?.estimated_revenue, data?.revenue?.currency)}
          icon="trending-up"
          iconTone="green"
        />
        <StatTile label="Repeat rate" value={pct(data?.growth?.repeat_rate)} icon="repeat" iconTone="violet" />
      </TileGrid>
      <InsightPanel
        title="Insights"
        subtitle="What this report is telling you — and what to do about it."
        insights={data?.insights ?? []}
      />
      {trend.some((row) => row.value > 0) ? (
        <ChartCard title="Daily trend" subtitle="Hover a day for the booking count">
          <LineAreaChart data={trend} color={iconTones.blue.foreground} unit="bookings" />
        </ChartCard>
      ) : null}
      {mix.length ? (
        <ChartCard title="Outcomes" subtitle="Hover a slice for the count">
          <DonutChart data={mix} centerLabel="bookings" />
        </ChartCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  tabScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: spacing.sm,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 132,
  },
  tabBtnDesktop: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabBtnLocked: {
    opacity: 0.78,
  },
  tabBtnPressed: {
    opacity: 0.92,
  },
  tabIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tabCopy: { flex: 1, minWidth: 0, gap: 1 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabLabel: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  tabLabelActive: { color: colors.primaryForeground },
  tabHint: { ...typography.tiny, color: colors.mutedForeground },
  tabHintActive: { color: 'rgba(255,255,255,0.78)' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  lockCard: { gap: spacing.sm },
  lockTitle: { ...typography.title, fontSize: 18, color: colors.foreground },
  lockMeta: { ...typography.body, color: colors.mutedForeground },
  lockCta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  lockCtaText: { ...typography.caption, fontWeight: '700', color: '#fff' },
  stack: { gap: spacing.md },
  heroTitle: { ...typography.title, fontSize: 20, color: colors.foreground },
  heroHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  section: { ...typography.title, fontSize: 16, color: colors.foreground },
  empty: { ...typography.body, color: colors.mutedForeground },
});
