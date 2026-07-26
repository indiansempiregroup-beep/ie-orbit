import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import {
  useBIForecast,
  useBIGrowth,
  useBIOverview,
  useBIReports,
  useBIRevenue,
  useBusinessBillingSnapshot,
} from '../../hooks/useOpsExtended';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Tab = 'overview' | 'growth' | 'revenue' | 'forecast' | 'reports';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  growth: 'Growth',
  revenue: 'Revenue',
  forecast: 'Forecast',
  reports: 'Reports',
};

function pct(value?: number | null) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function changeLabel(value?: number | null) {
  if (value == null) return null;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}% vs prior period`;
}

function money(amount?: number | null, currency?: string | null) {
  if (amount == null) return '—';
  return `${currency ?? ''} ${Number(amount).toFixed(2)}`.trim();
}

export function BIScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BI'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { billing } = useBusinessBillingSnapshot();
  const allowed = useMemo(
    () => new Set(billing?.bi_features?.length ? billing.bi_features : ['overview']),
    [billing?.bi_features],
  );
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'overview');
  const overview = useBIOverview();
  const growth = useBIGrowth();
  const revenue = useBIRevenue();
  const forecast = useBIForecast();
  const reports = useBIReports();

  useEffect(() => {
    if (!allowed.has(tab)) setTab('overview');
  }, [allowed, tab]);

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
  const tabLocked = !allowed.has(tab);

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => {
          const locked = !allowed.has(key);
          return (
            <Chip
              key={key}
              label={locked ? `${TAB_LABELS[key]} · Pro` : TAB_LABELS[key]}
              active={tab === key}
              onPress={() => {
                if (locked) {
                  setTab('overview');
                  return;
                }
                setTab(key);
              }}
            />
          );
        })}
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {tabLocked ? (
          <Card style={styles.lockCard}>
            <Text style={styles.lockTitle}>Pro feature</Text>
            <Text style={styles.lockMeta}>
              Your current plan includes BI Overview only. Upgrade to Pro for Growth, Revenue, Forecast, and
              Reports.
            </Text>
            <Pressable style={styles.lockCta} onPress={() => navigation.navigate('ProductSettings')}>
              <Text style={styles.lockCtaText}>Upgrade plan</Text>
            </Pressable>
          </Card>
        ) : null}
        {!tabLocked && tab === 'overview' ? <BIOverview data={overview.data} loading={overview.loading} /> : null}
        {!tabLocked && tab === 'growth' ? <BIGrowth data={growth.data} loading={growth.loading} /> : null}
        {!tabLocked && tab === 'revenue' ? <BIRevenue data={revenue.data} loading={revenue.loading} /> : null}
        {!tabLocked && tab === 'forecast' ? <BIForecast data={forecast.data} loading={forecast.loading} /> : null}
        {!tabLocked && tab === 'reports' ? <BIReports data={reports.data} loading={reports.loading} /> : null}
      </RefreshableScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  hint?: string | null;
}) {
  return (
    <Card style={styles.metric}>
      <View style={styles.metricIcon}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </Card>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.section}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function InsightCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card style={styles.insight}>
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightDetail}>{detail}</Text>
    </Card>
  );
}

function MiniBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 6 : 0) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function BIOverview({ data, loading }: { data: ReturnType<typeof useBIOverview>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const summary = data?.summary;
  const comparison = summary?.comparison;
  const operations = data?.operations;
  const weekdayMax = Math.max(...(operations?.by_weekday ?? []).map((row) => row.total), 1);

  return (
    <View style={styles.stack}>
      <SectionTitle title="Last 30 days" subtitle="Snapshot of bookings, revenue, and demand." />
      <View style={styles.grid}>
        <Metric
          label="Bookings"
          value={summary?.bookings ?? 0}
          icon="calendar"
          hint={changeLabel(comparison?.bookings_change_pct)}
        />
        <Metric
          label="Est. revenue"
          value={money(data?.revenue?.estimated_revenue, data?.revenue?.currency)}
          icon="dollar-sign"
          hint={changeLabel(comparison?.revenue_change_pct)}
        />
        <Metric label="Completed" value={summary?.completed ?? 0} icon="check-circle" hint={pct(summary?.completion_rate)} />
        <Metric label="No-shows" value={summary?.no_shows ?? 0} icon="user-x" hint={pct(summary?.no_show_rate)} />
        <Metric label="Cancelled" value={summary?.cancelled ?? 0} icon="x-circle" hint={pct(summary?.cancellation_rate)} />
        <Metric
          label="Avg / day"
          value={summary?.avg_bookings_per_day ?? 0}
          icon="activity"
          hint={operations?.busiest_day ? `Peak: ${operations.busiest_day}` : null}
        />
      </View>

      {(data?.insights ?? []).length ? (
        <View style={styles.stack}>
          <SectionTitle title="What stands out" />
          {(data?.insights ?? []).map((insight) => (
            <InsightCard key={`${insight.type}-${insight.title}`} title={insight.title} detail={insight.detail} />
          ))}
        </View>
      ) : null}

      {operations?.by_weekday?.length ? (
        <Card>
          <SectionTitle title="Demand by weekday" subtitle="Plan staffing around busy days." />
          <View style={styles.barList}>
            {operations.by_weekday.map((row) => (
              <MiniBar key={row.weekday} label={row.weekday_name.slice(0, 3)} value={row.total} max={weekdayMax} />
            ))}
          </View>
        </Card>
      ) : null}

      {(operations?.by_staff ?? []).length ? (
        <View style={styles.stack}>
          <SectionTitle title="Top staff" subtitle="By bookings this period." />
          {(operations?.by_staff ?? []).slice(0, 5).map((row) => (
            <Card key={row.staff_id} style={styles.serviceRow}>
              <View style={styles.flex}>
                <Text style={styles.serviceName}>{row.staff_name}</Text>
                <Text style={styles.rowMeta}>
                  {row.completed} completed · {row.no_shows} no-show
                </Text>
              </View>
              <Text style={styles.serviceValue}>{row.bookings}</Text>
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BIGrowth({ data, loading }: { data: ReturnType<typeof useBIGrowth>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  return (
    <View style={styles.stack}>
      <SectionTitle title="Customer growth" subtitle="Who is booking — and who comes back." />
      <View style={styles.grid}>
        <Metric label="New customers" value={data?.new_customers ?? 0} icon="user-plus" />
        <Metric label="Returning" value={data?.returning_customers ?? 0} icon="refresh-cw" />
        <Metric label="Repeat rate" value={pct(data?.repeat_rate)} icon="repeat" />
        <Metric label="Avg visits" value={data?.avg_visits_per_customer ?? 0} icon="layers" />
      </View>
      {(data?.top_customers ?? []).length ? (
        <View style={styles.stack}>
          <SectionTitle title="Most active customers" />
          {(data?.top_customers ?? []).map((row) => (
            <Card key={row.customer_id} style={styles.serviceRow}>
              <View style={styles.flex}>
                <Text style={styles.serviceName}>{row.customer_name}</Text>
                <Text style={styles.rowMeta}>
                  {row.bookings} bookings{row.is_returning ? ' · returning' : ' · new'}
                </Text>
              </View>
              <Text style={styles.serviceValue}>{Number(row.revenue).toFixed(0)}</Text>
            </Card>
          ))}
        </View>
      ) : (
        <Card>
          <Text style={styles.empty}>No customer booking activity in this period yet.</Text>
        </Card>
      )}
    </View>
  );
}

function BIRevenue({ data, loading }: { data: ReturnType<typeof useBIRevenue>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  return (
    <View style={styles.stack}>
      <SectionTitle title="Revenue" subtitle="Estimated from service list prices × bookings." />
      <View style={styles.grid}>
        <Metric
          label="Estimated"
          value={money(data?.estimated_revenue, data?.currency)}
          icon="dollar-sign"
        />
        <Metric
          label="Completed"
          value={money(data?.completed_revenue, data?.currency)}
          icon="check-circle"
        />
        <Metric
          label="Avg booking"
          value={money(data?.avg_booking_value, data?.currency)}
          icon="tag"
        />
      </View>
      {(data?.by_service ?? []).slice(0, 8).map((row) => (
        <Card key={row.service_id ?? row.service_name} style={styles.serviceRow}>
          <View style={styles.flex}>
            <Text style={styles.serviceName}>{row.service_name ?? row.service_id}</Text>
            <Text style={styles.rowMeta}>
              {row.bookings ?? 0} bookings · {row.completed ?? 0} completed
            </Text>
          </View>
          <Text style={styles.serviceValue}>{Number(row.revenue).toFixed(2)}</Text>
        </Card>
      ))}
    </View>
  );
}

function BIForecast({ data, loading }: { data: ReturnType<typeof useBIForecast>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  return (
    <View style={styles.stack}>
      <SectionTitle
        title={`Next ${data?.horizon_days ?? 30} days`}
        subtitle={`Based on the last ${data?.based_on_days ?? 30} days (${data?.based_on_bookings ?? 0} bookings).`}
      />
      <View style={styles.grid}>
        <Metric label="Projected bookings" value={data?.projected_bookings ?? 0} icon="calendar" />
        <Metric
          label="Projected revenue"
          value={money(data?.projected_revenue, data?.currency)}
          icon="dollar-sign"
        />
        <Metric label="Avg daily bookings" value={data?.avg_daily_bookings ?? 0} icon="activity" />
        <Metric
          label="Avg daily revenue"
          value={money(data?.avg_daily_revenue, data?.currency)}
          icon="trending-up"
        />
      </View>
    </View>
  );
}

function BIReports({ data, loading }: { data: ReturnType<typeof useBIReports>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const summary = data?.summary;
  const trendMax = Math.max(...(data?.trends?.rows ?? []).map((row) => row.total), 1);
  const recent = (data?.trends?.rows ?? []).slice(-10);

  return (
    <View style={styles.stack}>
      <SectionTitle title="Operations report" subtitle="Combined summary for the last 30 days." />
      <View style={styles.grid}>
        <Metric label="Bookings" value={summary?.bookings ?? 0} icon="calendar" />
        <Metric label="Completion" value={pct(summary?.completion_rate)} icon="check-circle" />
        <Metric
          label="Est. revenue"
          value={money(data?.revenue?.estimated_revenue, data?.revenue?.currency)}
          icon="trending-up"
        />
        <Metric label="Repeat rate" value={pct(data?.growth?.repeat_rate)} icon="repeat" />
      </View>

      {recent.length ? (
        <Card>
          <SectionTitle title="Recent daily trend" />
          <View style={styles.barList}>
            {recent.map((row) => (
              <MiniBar key={row.day} label={row.day.slice(5)} value={row.total} max={trendMax} />
            ))}
          </View>
        </Card>
      ) : null}

      {(data?.insights ?? []).length ? (
        <View style={styles.stack}>
          <SectionTitle title="Insights" />
          {(data?.insights ?? []).map((insight) => (
            <InsightCard key={`${insight.type}-${insight.title}`} title={insight.title} detail={insight.detail} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stack: { gap: spacing.md },
  metric: { width: '47%' },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: { ...typography.caption, color: colors.mutedForeground },
  metricValue: { ...typography.heading, fontSize: 18, color: colors.primary, marginTop: 4 },
  metricHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  sectionHead: { gap: 4 },
  section: { ...typography.title, fontSize: 16, color: colors.foreground },
  sectionSub: { ...typography.caption, color: colors.mutedForeground },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  serviceName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  serviceValue: { ...typography.label, color: colors.primary, fontWeight: '700' },
  rowMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  flex: { flex: 1 },
  insight: { gap: 4 },
  insightTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  insightDetail: { ...typography.caption, color: colors.mutedForeground },
  barList: { gap: spacing.sm, marginTop: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 36, ...typography.caption, color: colors.mutedForeground },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.full },
  barValue: { width: 28, textAlign: 'right', ...typography.caption, color: colors.foreground },
  empty: { ...typography.body, color: colors.mutedForeground },
});
