import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBIForecast, useBIOverview, useBIReports, useBIRevenue } from '../../hooks/useOpsExtended';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Tab = 'overview' | 'revenue' | 'forecast' | 'reports';

export function BIScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BI'>>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'overview');
  const overview = useBIOverview();
  const revenue = useBIRevenue();
  const forecast = useBIForecast();
  const reports = useBIReports();

  const reload = async () => {
    await Promise.all([overview.reload(), revenue.reload(), forecast.reload(), reports.reload()]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const loading = overview.loading || revenue.loading || forecast.loading || reports.loading;

  return (
    <View style={styles.screen}>
      <OpsHeader title="Business intelligence" subtitle="Last 30 days" />
      <View style={styles.tabs}>
        {(['overview', 'revenue', 'forecast', 'reports'] as Tab[]).map((key) => (
          <Chip key={key} label={key} active={tab === key} onPress={() => setTab(key)} />
        ))}
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {tab === 'overview' ? <BIOverview data={overview.data} loading={overview.loading} /> : null}
        {tab === 'revenue' ? <BIRevenue data={revenue.data} loading={revenue.loading} /> : null}
        {tab === 'forecast' ? <BIForecast data={forecast.data} loading={forecast.loading} /> : null}
        {tab === 'reports' ? <BIReports data={reports.data} loading={reports.loading} /> : null}
      </RefreshableScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <Card style={styles.metric}>
      <View style={styles.metricIcon}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Card>
  );
}

function BIOverview({ data, loading }: { data: ReturnType<typeof useBIOverview>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const summary = data?.summary;
  return (
    <View style={styles.grid}>
      <Metric label="Bookings" value={summary?.bookings ?? 0} icon="calendar" />
      <Metric label="Completed" value={summary?.completed ?? 0} icon="check-circle" />
      <Metric label="Cancelled" value={summary?.cancelled ?? 0} icon="x-circle" />
      <Metric
        label="Completion rate"
        value={summary?.completion_rate != null ? `${Math.round(summary.completion_rate * 100)}%` : '—'}
        icon="trending-up"
      />
    </View>
  );
}

function BIRevenue({ data, loading }: { data: ReturnType<typeof useBIRevenue>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  return (
    <View style={styles.stack}>
      <Card>
        <Text style={styles.section}>Estimated revenue</Text>
        <Text style={styles.big}>
          {data?.estimated_revenue ?? 0} {data?.currency ?? ''}
        </Text>
      </Card>
      {(data?.by_service ?? []).slice(0, 8).map((row) => (
        <Card key={row.service_id ?? row.service_name} style={styles.serviceRow}>
          <Text style={styles.serviceName}>{row.service_name ?? row.service_id}</Text>
          <Text style={styles.serviceValue}>{row.revenue}</Text>
        </Card>
      ))}
    </View>
  );
}

function BIForecast({ data, loading }: { data: ReturnType<typeof useBIForecast>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  return (
    <View style={styles.grid}>
      <Metric label="Projected bookings" value={data?.projected_bookings ?? 0} icon="calendar" />
      <Metric label="Projected revenue" value={data?.projected_revenue ?? 0} icon="dollar-sign" />
    </View>
  );
}

function BIReports({ data, loading }: { data: ReturnType<typeof useBIReports>['data']; loading: boolean }) {
  if (loading && !data) return <ScreenState loading />;
  const summary = data?.summary;
  return (
    <View style={styles.grid}>
      <Metric label="Bookings" value={summary?.bookings ?? 0} icon="calendar" />
      <Metric label="Completed" value={summary?.completed ?? 0} icon="check-circle" />
      <Metric label="Est. revenue" value={data?.revenue?.estimated_revenue ?? 0} icon="trending-up" />
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
  metricValue: { ...typography.heading, fontSize: 20, color: colors.primary, marginTop: 4 },
  section: { ...typography.title, fontSize: 16, color: colors.foreground },
  big: { ...typography.heading, color: colors.primary, marginTop: spacing.md },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { ...typography.body, color: colors.foreground, flex: 1, fontWeight: '600' },
  serviceValue: { ...typography.label, color: colors.primary, fontWeight: '700' },
});
