import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { BIAppointieProfit } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useReportStaffFilter } from '../../hooks/useReportStaffFilter';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { MetricTile } from './components/MetricTile';
import { StatCard } from './components/StatCard';
import { TablePagination } from './components/TablePagination';
import { WidgetHelpTitle } from './components/WidgetHelpTitle';
import { BooksInvoiceDrawer } from '../shop/BooksInvoiceDrawer';
import { BarGraph, CHART_PALETTE, DonutPieChart, LineAreaChart } from './components/charts';
import { useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

const PROFIT_HELP_KEYS = {
  kept: 'bi.profitHelp.kept',
  paid: 'bi.profitHelp.paid',
  discounts: 'bi.profitHelp.discounts',
  returns: 'bi.profitHelp.returns',
  stockCash: 'bi.profitHelp.stockCash',
  losing: 'bi.profitHelp.losing',
  stockCost: 'bi.profitHelp.stockCost',
  cancels: 'bi.profitHelp.cancels',
  potential: 'bi.profitHelp.potential',
  gstCollected: 'bi.profitHelp.gstCollected',
  gstRemit: 'bi.profitHelp.gstRemit',
  bestDay: 'bi.profitHelp.bestDay',
  bestChannel: 'bi.profitHelp.bestChannel',
  bestCategory: 'bi.profitHelp.bestCategory',
  orders: 'bi.profitHelp.orders',
  itemsSold: 'bi.profitHelp.itemsSold',
  rupeePie: 'bi.profitHelp.rupeePie',
  profitTrend: 'bi.profitHelp.profitTrend',
  revenueTrend: 'bi.profitHelp.revenueTrend',
  channelPie: 'bi.profitHelp.channelPie',
  categoryPie: 'bi.profitHelp.categoryPie',
  weekdayBars: 'bi.profitHelp.weekdayBars',
  makingMoney: 'bi.profitHelp.makingMoney',
  losingList: 'bi.profitHelp.losingList',
  soldTable: 'bi.profitHelp.soldTable',
  priceGaps: 'bi.profitHelp.priceGaps',
  thinGaps: 'bi.profitHelp.thinGaps',
  loyalty: 'bi.profitHelp.loyalty',
  loyaltyGiven: 'bi.profitHelp.loyaltyGiven',
  loyaltyUsed: 'bi.profitHelp.loyaltyUsed',
  loyaltyNet: 'bi.profitHelp.loyaltyNet',
  loyaltyMoves: 'bi.profitHelp.loyaltyMoves',
  loyaltyMoneyGiven: 'bi.profitHelp.loyaltyMoneyGiven',
  loyaltyRowPoints: 'bi.profitHelp.loyaltyRowPoints',
  loyaltyRowProfit: 'bi.profitHelp.loyaltyRowProfit',
} as const;

const APPOINT_HELP_KEYS = {
  estimated: 'bi.appointHelp.estimated',
  completed: 'bi.appointHelp.completed',
  open: 'bi.appointHelp.open',
  lost: 'bi.appointHelp.lost',
  bookings: 'bi.appointHelp.bookings',
  avg: 'bi.appointHelp.avg',
  completion: 'bi.appointHelp.completion',
  trend: 'bi.appointHelp.trend',
  services: 'bi.appointHelp.services',
  staff: 'bi.appointHelp.staff',
  weekday: 'bi.appointHelp.weekday',
} as const;

function useHelpTexts<T extends Record<string, string>>(keys: T): Record<keyof T, string> {
  const { t } = useTranslation();
  return useMemo(
    () =>
      Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, t(value)])) as Record<keyof T, string>,
    [keys, t],
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function changeHint(t: TFunction, value?: number | null) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return t('bi.changeVsPrior', { value: `${prefix}${value}` });
}

function AppointieProfitDashboard({ data, currency }: { data: BIAppointieProfit; currency: string }) {
  const { t } = useTranslation();
  const APPOINT_HELP = useHelpTexts(APPOINT_HELP_KEYS);
  const servicePie = useMemo(
    () =>
      (data.by_service ?? [])
        .slice(0, 7)
        .map((row, index) => ({
          label: row.service_name,
          value: Math.max(0, Number(row.revenue) || 0),
          color: CHART_PALETTE[index % CHART_PALETTE.length],
        }))
        .filter((row) => row.value > 0),
    [data.by_service],
  );
  const earningsLine = useMemo(
    () =>
      (data.series ?? []).map((row) => ({
        label: row.date,
        value: Number(row.estimated_revenue) || 0,
      })),
    [data.series],
  );
  const completedLine = useMemo(
    () =>
      (data.series ?? []).map((row) => ({
        label: row.date,
        value: Number(row.completed_revenue) || 0,
      })),
    [data.series],
  );
  const weekdayBars = useMemo(
    () =>
      (data.by_weekday ?? []).map((row, index) => ({
        label: (row.weekday_name || '').slice(0, 3),
        value: Math.max(0, Number(row.revenue ?? row.total) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [data.by_weekday],
  );
  const outcomePie = useMemo(
    () =>
      [
        { label: t('bi.completed'), value: data.completed ?? 0, color: '#0f766e' },
        { label: t('bi.cancelled'), value: data.cancelled ?? 0, color: '#b91c1c' },
        { label: t('bi.noShows'), value: data.no_shows ?? 0, color: '#b45309' },
        {
          label: t('bi.profitOpen'),
          value: Math.max(0, (data.bookings ?? 0) - (data.completed ?? 0) - (data.cancelled ?? 0) - (data.no_shows ?? 0)),
          color: '#1d4ed8',
        },
      ].filter((row) => row.value > 0),
    [data.bookings, data.cancelled, data.completed, data.no_shows, t],
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <SectionHeading
          title={t('public.nav.appoint')}
          subtitle={t('bi.profitAppointSub')}
        />
      </Card>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.whatStandsOut')}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.insights ?? []).map((insight) => (
              <div key={`${insight.type}-${insight.title}`}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{insight.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))' }}>
        <StatCard
          label={t('bi.profitEstEarnings')}
          help={APPOINT_HELP.estimated}
          tone="profit"
          value={formatMoney(data.estimated_revenue, currency)}
          delta={changeHint(t, data.comparison?.revenue_change_pct)}
          deltaPositive={data.comparison?.revenue_change_pct != null ? data.comparison.revenue_change_pct >= 0 : null}
        />
        <StatCard
          label={t('bi.profitCompletedEarnings')}
          help={APPOINT_HELP.completed}
          tone="success"
          value={formatMoney(data.completed_revenue ?? 0, currency)}
        />
        <StatCard
          label={t('bi.profitStillOpen')}
          help={APPOINT_HELP.open}
          tone="info"
          value={formatMoney(data.open_revenue ?? 0, currency)}
        />
        <StatCard
          label={t('bi.profitLostToCancels')}
          help={APPOINT_HELP.lost}
          tone="warning"
          value={formatMoney(data.lost_total ?? 0, currency)}
          hint={
            data.lost_cancelled || data.lost_no_shows
              ? t('bi.profitLostSplit', {
                  cancelled: formatMoney(data.lost_cancelled ?? 0, currency),
                  noShows: formatMoney(data.lost_no_shows ?? 0, currency),
                })
              : undefined
          }
        />
        <StatCard
          label={t('bi.bookings')}
          help={APPOINT_HELP.bookings}
          tone="info"
          value={data.bookings ?? 0}
          delta={changeHint(t, data.comparison?.bookings_change_pct)}
          deltaPositive={data.comparison?.bookings_change_pct != null ? data.comparison.bookings_change_pct >= 0 : null}
        />
        <StatCard
          label={t('bi.profitAvgBooking')}
          help={APPOINT_HELP.avg}
          value={formatMoney(data.avg_booking_value ?? 0, currency)}
        />
        <StatCard
          label={t('bi.profitCompletion')}
          help={APPOINT_HELP.completion}
          tone="success"
          value={`${Math.round((data.completion_rate ?? 0) * 100)}%`}
          hint={t('bi.profitCompletedCount', { n: data.completed ?? 0 })}
        />
        <StatCard
          label={t('bi.profitBestDay')}
          tone="info"
          value={data.busiest_day || '—'}
          hint={data.busiest_hour ? t('bi.profitPeakAround', { hour: data.busiest_hour }) : undefined}
        />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title={t('bi.profitIsEarningsUp')} help={APPOINT_HELP.trend} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitDayByDayEst')}
          </p>
          {earningsLine.length > 1 ? (
            <LineAreaChart
              data={earningsLine}
              color="#0f766e"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNeedBookings2Days')}</p>
          )}
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitCompletedEarnings')} help={APPOINT_HELP.completed} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitDayByDayCompleted')}
          </p>
          {completedLine.some((row) => row.value > 0) && completedLine.length > 1 ? (
            <LineAreaChart
              data={completedLine}
              color="#1d4ed8"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoCompletedEarnings')}</p>
          )}
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitOutcomes')} help={APPOINT_HELP.completion} />
          {outcomePie.length ? (
            <DonutPieChart data={outcomePie} centerLabel={t('bi.profitCenterBookings')} />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoBookingsYet')}</p>
          )}
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitEarningsByService')} help={APPOINT_HELP.services} />
          {servicePie.length ? (
            <DonutPieChart
              data={servicePie}
              centerLabel={t('bi.profitCenterEarnings')}
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoPricedServices')}</p>
          )}
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitWhichWeekday')} help={APPOINT_HELP.weekday} />
          {weekdayBars.some((row) => row.value > 0) ? (
            <BarGraph data={weekdayBars} color="#0369a1" formatValue={(value) => formatMoney(value, currency)} />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoWeekdayEarnings')}</p>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title={t('bi.profitServicesBrought')} help={APPOINT_HELP.services} />
          <p style={{ margin: '8px 0 12px', color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitServiceNote')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.by_service ?? []).slice(0, 8).map((row) => (
              <div key={row.service_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.service_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitBookedFinished', { booked: row.bookings ?? 0, finished: row.completed ?? 0 })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{formatMoney(row.revenue, currency)}</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{t('bi.profitBookedValue')}</div>
                </div>
              </div>
            ))}
            {!(data.by_service ?? []).length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.noPricedBookings')}</p>
            ) : null}
          </div>
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitWhoFinished')} help={APPOINT_HELP.staff} />
          <p style={{ margin: '8px 0 12px', color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitStaffNote')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.by_staff ?? []).slice(0, 8).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitFinishedCancelledNoShow', {
                      completed: row.completed,
                      cancelled: row.cancelled,
                      noShows: row.no_shows,
                    })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{formatMoney(row.revenue, currency)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitFromFinished', { n: row.completed })}
                  </div>
                </div>
              </div>
            ))}
            {!(data.by_staff ?? []).length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoStaffActivity')}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

type ChannelFilter = 'all' | 'pos' | 'online_pickup' | 'online_delivery';
type SortKey = 'gross_profit' | 'margin_percent' | 'revenue' | 'units' | 'name';

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetRange(preset: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === 'today') {
    return { from: isoDate(to), to: isoDate(to) };
  }
  if (preset === '7d') {
    from.setDate(from.getDate() - 6);
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (preset === 'mtd') {
    from.setDate(1);
    return { from: isoDate(from), to: isoDate(to) };
  }
  // 30d default
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

const CHANNEL_LABEL_KEYS: Record<string, string> = {
  pos: 'bi.profitChannelPos',
  online_pickup: 'bi.profitChannelPickup',
  online_delivery: 'bi.profitChannelDelivery',
};

export function BIProfitPage() {
  const { t } = useTranslation();
  const PROFIT_HELP = useHelpTexts(PROFIT_HELP_KEYS);
  const channelLabel = (key?: string | null) => (key && CHANNEL_LABEL_KEYS[key] ? t(CHANNEL_LABEL_KEYS[key]) : undefined);
  usePageMeta({ title: `${t('bi.title')}: ${t('bi.profit')} — Orbit` });
  const client = useApiClient();
  const { activeBusiness } = useWorkspace();
  const { showAppointie, showShopie, currency } = useBiProductVisibility('profit');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const { staffId } = useReportStaffFilter();
  const businessId = activeBusiness?.id || '';

  const initial = useMemo(() => presetRange('30d'), []);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('gross_profit');
  const [offset, setOffset] = useState(0);
  const [loyaltyDirection, setLoyaltyDirection] = useState<'all' | 'given' | 'used'>('all');
  const [loyaltyQ, setLoyaltyQ] = useState('');
  const [loyaltySearch, setLoyaltySearch] = useState('');
  const [loyaltyOffset, setLoyaltyOffset] = useState(0);
  const [loyaltyPageSize, setLoyaltyPageSize] = useState(10);
  const [pageSize, setPageSize] = useState(10);
  const [booksInvoiceId, setBooksInvoiceId] = useState<string | null>(null);
  const limit = pageSize;

  const insights = useQuery({
    queryKey: [
      'bi-product-profit',
      businessId,
      dateFrom,
      dateTo,
      channel,
      search,
      sort,
      offset,
      pageSize,
      staffId,
    ],
    enabled: Boolean(businessId) && showShopie,
    queryFn: async () => {
      const response = await client.shop.productProfitInsights({
        business_id: businessId,
        date_from: dateFrom,
        date_to: dateTo,
        channel: channel === 'all' ? undefined : channel,
        q: search || undefined,
        sort,
        order: sort === 'name' ? 'asc' : 'desc',
        limit,
        offset,
        include_catalog: !staffId,
        staff_id: staffId || undefined,
      });
      return response.data;
    },
  });

  const loyalty = useQuery({
    queryKey: [
      'bi-loyalty-report',
      businessId,
      dateFrom,
      dateTo,
      loyaltyDirection,
      loyaltySearch,
      loyaltyOffset,
      loyaltyPageSize,
      staffId,
      'shop',
    ],
    enabled: Boolean(businessId) && showShopie,
    queryFn: async () => {
      const response = await client.customers.loyaltyReport({
        business: businessId,
        date_from: dateFrom,
        date_to: dateTo,
        direction: loyaltyDirection === 'all' ? undefined : loyaltyDirection,
        q: loyaltySearch || undefined,
        record_kind: 'shop',
        limit: loyaltyPageSize,
        offset: loyaltyOffset,
        staff_id: staffId || undefined,
      });
      return response.data;
    },
  });

  const appointieProfit = useQuery({
    queryKey: ['bi-appointie-profit', businessId, dateFrom, dateTo, staffId],
    enabled: Boolean(businessId) && showAppointie,
    queryFn: async () => {
      const response = await client.bi.profit({
        start_date: dateFrom,
        end_date: dateTo,
        staff_id: staffId || undefined,
      });
      return response.data.appointie ?? null;
    },
  });

  const activePreset = useMemo(() => {
    for (const key of ['today', '7d', '30d', 'mtd'] as const) {
      const range = presetRange(key);
      if (range.from === dateFrom && range.to === dateTo) return key;
    }
    return null;
  }, [dateFrom, dateTo]);

  const summary = insights.data?.summary;
  const comparison = insights.data?.comparison;
  const narrative = insights.data?.insights ?? [];
  const sales = insights.data?.sales ?? [];
  const byChannel = insights.data?.by_channel ?? [];
  const byCategory = insights.data?.by_category ?? [];
  const byWeekday = insights.data?.by_weekday ?? [];
  const series = insights.data?.series ?? [];
  const topMargins = insights.data?.top_margins ?? [];
  const lowMargins = insights.data?.low_margins ?? [];
  const topProfitProducts = insights.data?.top_profit_products ?? [];
  const lossMakers = insights.data?.loss_makers ?? [];
  const stockRisk = insights.data?.stock_risk ?? [];
  const salesTotal = insights.data?.sales_total ?? 0;
  const loyaltySummary = loyalty.data?.summary;
  const loyaltyLedger = (loyalty.data?.ledger ?? []).filter(
    (row) => row.record_kind !== 'booking' && row.source_label !== 'Booking',
  );
  const loyaltyTotal = loyalty.data?.ledger_total ?? loyaltySummary?.entry_count ?? 0;
  const loyaltyEnabled = loyalty.data?.enabled !== false;
  const loyaltyMix = useMemo(() => {
    if (!loyaltySummary) return [];
    return [
      {
        label: t('bi.profitLoyaltyGiven'),
        value: Math.max(0, Number(loyaltySummary.points_earned) || 0),
        color: '#0f766e',
      },
      {
        label: t('bi.profitLoyaltyUsed'),
        value: Math.max(0, Number(loyaltySummary.points_redeemed) || 0),
        color: '#b45309',
      },
    ].filter((row) => row.value > 0);
  }, [loyaltySummary, t]);

  const channelPie = useMemo(
    () =>
      byChannel.map((row, index) => ({
        label: channelLabel(row.channel) || row.channel,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byChannel, t],
  );

  const categoryPie = useMemo(
    () =>
      byCategory.slice(0, 7).map((row, index) => ({
        label: row.category_label || row.category,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [byCategory],
  );

  const profitLine = useMemo(
    () =>
      series.map((row) => ({
        label: row.date,
        value: Number(row.gross_profit) || 0,
      })),
    [series],
  );

  const revenueLine = useMemo(
    () =>
      series.map((row) => ({
        label: row.date,
        value: Number(row.revenue) || 0,
      })),
    [series],
  );

  const weekdayBars = useMemo(
    () =>
      byWeekday.map((row, index) => ({
        label: row.label,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [byWeekday],
  );

  const topProductBars = useMemo(
    () =>
      topProfitProducts.slice(0, 8).map((row, index) => ({
        label: row.name,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [topProfitProducts],
  );

  const rupeePie = useMemo(
    () =>
      (insights.data?.rupee_composition ?? [])
        .map((row) => ({
          label: row.label,
          value: Math.max(0, Number(row.value) || 0),
          color: row.color,
        }))
        .filter((row) => row.value > 0),
    [insights.data?.rupee_composition],
  );

  const deltaColor = (value?: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || value === '') return undefined;
    if (n > 0) return '#059669';
    if (n < 0) return '#b91c1c';
    return undefined;
  };

  const deltaLabel = (value?: string) => {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n}%`;
  };

  const insightToneColor = (tone: string) => {
    if (tone === 'positive') return '#059669';
    if (tone === 'warning') return '#b91c1c';
    return 'var(--muted-foreground)';
  };

  const applyPreset = (preset: string) => {
    const range = presetRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setOffset(0);
    setLoyaltyOffset(0);
  };

  const exportCsv = () => {
    const header = [
      t('bi.profitColProduct'),
      t('bi.profitColSku'),
      t('bi.profitColSold'),
      t('bi.profitColCustomersPaid'),
      t('bi.profitColDiscounts'),
      t('bi.profitColStockPaid'),
      t('bi.profitColYourProfit'),
      t('bi.profitColYouKeep'),
    ];
    const rows = sales.map((row) =>
      [
        row.name,
        row.sku || '',
        row.units_sold,
        row.revenue,
        row.discounts || '0',
        row.cogs,
        row.gross_profit,
        row.margin_percent || '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bi-profit-${dateFrom}-${dateTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.profit')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: 12 }}>
          {showSwitcher
            ? t('bi.profitIntroSwitch')
            : showShopie
              ? t('bi.profitIntroMart')
              : t('bi.profitIntroAppoint')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, marginTop: showSwitcher ? 12 : 0 }}>
          {[
            ['today', t('common.today')],
            ['7d', t('bi.profitPreset7d')],
            ['30d', t('bi.profitPreset30d')],
            ['mtd', t('bi.profitPresetMtd')],
          ].map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant={activePreset === key ? 'primary' : 'neutral'}
              onClick={() => applyPreset(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            {t('common.from')}
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            {t('common.to')}
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
        </div>
      </Card>

      {product === 'appointie' && showAppointie && appointieProfit.isLoading ? (
        <Card>{t('bi.profitLoadingAppoint')}</Card>
      ) : null}
      {product === 'appointie' && showAppointie && appointieProfit.data ? (
        <AppointieProfitDashboard data={appointieProfit.data} currency={currency} />
      ) : null}

      {product === 'shopie' && showShopie ? (
      <>
      <Card>
        <SectionHeading
          title={t('public.nav.mart')}
          subtitle={t('bi.profitMartSub')}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 16 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            {t('bi.profitChannel')}
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as ChannelFilter);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', minWidth: 140 }}
            >
              <option value="all">{t('common.all')}</option>
              <option value="pos">{t('bi.profitChannelPos')}</option>
              <option value="online_pickup">{t('bi.profitChannelPickup')}</option>
              <option value="online_delivery">{t('bi.profitChannelDelivery')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, flex: '1 1 180px' }}>
            {t('bi.profitSearchProduct')}
            <input
              type="search"
              value={q}
              placeholder={t('bi.profitNameOrSku')}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setSearch(q.trim());
                  setOffset(0);
                }
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            {t('bi.profitSort')}
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortKey);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <option value="gross_profit">{t('bi.profitColYourProfit')}</option>
              <option value="margin_percent">{t('bi.profitColYouKeep')}</option>
              <option value="revenue">{t('bi.profitColCustomersPaid')}</option>
              <option value="units">{t('bi.profitColSold')}</option>
              <option value="name">{t('bi.profitSortName')}</option>
            </select>
          </label>
          <Button
            type="button"
            variant="neutral"
            onClick={() => {
              setSearch(q.trim());
              setOffset(0);
              void insights.refetch();
            }}
          >
            {t('bi.profitApply')}
          </Button>
          <Link to="/shop/products" style={{ fontSize: 13, alignSelf: 'center' }}>
            {t('bi.profitManageProducts')}
          </Link>
        </div>
      </Card>
      {insights.isLoading ? <Card>{t('bi.profitLoadingInsights')}</Card> : null}
      {insights.error ? (
        <Card>
          <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>
            {(insights.error as Error).message}
          </p>
        </Card>
      ) : null}

      {summary ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))' }}>
          <StatCard
            label={t('bi.profitKeptLabel')}
            help={PROFIT_HELP.kept}
            tone="profit"
            value={formatMoney(Number(summary.kept_profit ?? summary.gross_profit), currency)}
            hint={t('bi.profitKeptHint')}
            meter={Math.min(100, Math.max(0, Number(summary.kept_rate_percent || 0)))}
            delta={
              comparison?.profit_delta_percent
                ? t('bi.profitVsLastPeriod', { delta: deltaLabel(comparison.profit_delta_percent) })
                : summary.leakage_total && Number(summary.leakage_total) > 0
                  ? t('bi.profitLeakage', { amount: formatMoney(Number(summary.leakage_total), currency) })
                  : undefined
            }
            deltaPositive={
              comparison?.profit_delta_percent
                ? Number(comparison.profit_delta_percent) >= 0
                : !(summary.leakage_total && Number(summary.leakage_total) > 0)
            }
          />
          <StatCard
            label={t('bi.profitPaidLabel')}
            help={PROFIT_HELP.paid}
            tone="revenue"
            value={formatMoney(Number(summary.sales_revenue), currency)}
            hint={t('bi.profitPaidHint')}
            delta={
              comparison?.revenue_delta_percent
                ? t('bi.profitVsLastPeriod', { delta: deltaLabel(comparison.revenue_delta_percent) })
                : undefined
            }
            deltaPositive={
              comparison?.revenue_delta_percent ? Number(comparison.revenue_delta_percent) >= 0 : null
            }
          />
          <StatCard
            label={t('bi.profitDiscountsLabel')}
            help={PROFIT_HELP.discounts}
            tone="warning"
            value={formatMoney(Number(summary.discounts_total || 0), currency)}
            hint={
              Number(summary.discounts_total || 0) > 0
                ? t('bi.profitDiscountsHint')
                : t('bi.profitNoDiscounts')
            }
          />
          <StatCard
            label={t('bi.profitReturnsLabel')}
            help={PROFIT_HELP.returns}
            tone="warning"
            value={formatMoney(Number(summary.returns_profit || 0), currency)}
            hint={t('bi.profitReturnsHint')}
          />
          <StatCard
            label={t('bi.profitStockCashLabel')}
            help={PROFIT_HELP.stockCash}
            tone="cost"
            value={formatMoney(Number(summary.inventory_at_cost), currency)}
            hint={
              summary.inventory_days_cover
                ? t('bi.profitStockCashHintDays', { days: summary.inventory_days_cover })
                : t('bi.profitStockCashHint')
            }
          />
          <StatCard
            label={t('bi.profitLosingLabel')}
            help={PROFIT_HELP.losing}
            tone={summary.loss_maker_count ? 'warning' : 'success'}
            value={summary.loss_maker_count ?? 0}
            hint={
              summary.loss_maker_count
                ? t('bi.profitLosingHintSome')
                : t('bi.profitLosingHintNone')
            }
          />
          <StatCard
            label={t('bi.profitStockCostLabel')}
            help={PROFIT_HELP.stockCost}
            tone="cost"
            value={formatMoney(Number(summary.sales_cogs || 0), currency)}
            hint={t('bi.profitStockCostHint')}
          />
          <StatCard
            label={t('bi.profitGstCollectedLabel')}
            help={PROFIT_HELP.gstCollected}
            tone="info"
            value={formatMoney(Number(summary.gst_collected || 0), currency)}
            hint={t('bi.profitGstCollectedHint')}
          />
          <StatCard
            label={t('bi.profitGstRemitLabel')}
            help={PROFIT_HELP.gstRemit}
            tone="warning"
            value={formatMoney(Number(summary.gst_to_remit || summary.gst_collected || 0), currency)}
            hint={t('bi.profitGstRemitHint')}
          />
          <StatCard
            label={t('bi.profitCancelledBills')}
            help={PROFIT_HELP.cancels}
            tone="warning"
            value={formatMoney(Number(summary.cancels_profit || 0), currency)}
            hint={t('bi.profitCancelledBillsHint')}
          />
          <StatCard
            label={t('bi.profitIfAllSells')}
            help={PROFIT_HELP.potential}
            tone="profit"
            value={formatMoney(Number(summary.potential_profit || 0), currency)}
            hint={t('bi.profitIfAllSellsHint')}
          />
          <StatCard
            label={t('bi.profitBestSellingDay')}
            help={PROFIT_HELP.bestDay}
            tone="info"
            value={summary.best_weekday || '—'}
            hint={
              summary.best_weekday_profit
                ? formatMoney(Number(summary.best_weekday_profit), currency)
                : undefined
            }
          />
          <StatCard
            label={t('bi.profitBestChannel')}
            help={PROFIT_HELP.bestChannel}
            tone="revenue"
            value={channelLabel(summary.best_channel) || summary.best_channel || '—'}
            hint={
              summary.best_channel_profit
                ? formatMoney(Number(summary.best_channel_profit), currency)
                : undefined
            }
          />
          <StatCard
            label={t('bi.profitBestCategory')}
            help={PROFIT_HELP.bestCategory}
            tone="success"
            value={summary.best_category || '—'}
            hint={
              summary.best_category_profit
                ? formatMoney(Number(summary.best_category_profit), currency)
                : undefined
            }
          />
          <StatCard
            label={t('bi.orders')}
            help={PROFIT_HELP.orders}
            tone="info"
            value={summary.order_count ?? 0}
            hint={t('bi.profitProfitPerBill', { amount: formatMoney(Number(summary.avg_order_profit || 0), currency) })}
          />
          <StatCard
            label={t('bi.profitItemsSold')}
            help={PROFIT_HELP.itemsSold}
            tone="info"
            value={summary.units_sold || '0'}
            hint={t('bi.profitDifferentProducts', { n: summary.products_sold_count ?? salesTotal })}
          />
        </div>
      ) : null}

      {narrative.length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>{t('bi.profitWhatToNotice')}</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {narrative.map((item) => (
              <div
                key={`${item.title}-${item.detail}`}
                style={{
                  display: 'grid',
                  gap: 4,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 700, color: insightToneColor(item.tone) }}>{item.title}</div>
                <div style={{ fontSize: 14, color: 'var(--foreground)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title={t('bi.profitWhereMoneyWent')} help={PROFIT_HELP.rupeePie} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitWhereMoneySub')}
          </p>
          {rupeePie.length ? (
            <DonutPieChart
              data={rupeePie}
              centerLabel={t('bi.profitCenterSplit')}
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
              {t('bi.profitAddCostHint')}
            </p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitIsProfitUp')} help={PROFIT_HELP.profitTrend} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitDayByDayProfit')}
          </p>
          {profitLine.length > 1 ? (
            <LineAreaChart
              data={profitLine}
              color="#0f766e"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
              {t('bi.profitNeedSales2DaysLine')}
            </p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitMoneyComing')} help={PROFIT_HELP.revenueTrend} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitDayByDaySales')}
          </p>
          {revenueLine.length > 1 ? (
            <LineAreaChart
              data={revenueLine}
              color="#1d4ed8"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNeed2DaysSales')}</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitSalesByChannel')} help={PROFIT_HELP.channelPie} />
          <div style={{ height: 8 }} />
          {channelPie.some((row) => row.value > 0) ? (
            <DonutPieChart
              data={channelPie}
              centerLabel="profit"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoChannelSplit')}</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitSalesByCategory')} help={PROFIT_HELP.categoryPie} />
          <div style={{ height: 8 }} />
          {categoryPie.some((row) => row.value > 0) ? (
            <DonutPieChart
              data={categoryPie}
              centerLabel="profit"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoCategorySalesYet')}</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitWhichWeekday')} help={PROFIT_HELP.weekdayBars} />
          <div style={{ height: 8 }} />
          {weekdayBars.some((row) => row.value > 0) ? (
            <BarGraph
              data={weekdayBars}
              color="#0369a1"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoWeekdayData')}</p>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title={t('bi.profitProductsMaking')} help={PROFIT_HELP.makingMoney} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitStockMore')}
          </p>
          {topProductBars.some((row) => row.value > 0) ? (
            <div style={{ marginBottom: 12 }}>
              <BarGraph
                data={topProductBars}
                color="#0f766e"
                formatValue={(value) => formatMoney(value, currency)}
              />
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10 }}>
            {topProfitProducts.slice(0, 8).map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitUnitsSold', { n: row.units_sold })}
                    {row.margin_percent != null ? ` · ${t('bi.profitYouKeepPct', { pct: row.margin_percent })}` : ''}
                  </div>
                </div>
                <span style={{ fontWeight: 700 }}>{formatMoney(Number(row.gross_profit), currency)}</span>
              </div>
            ))}
            {!topProfitProducts.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoSalesProfit')}</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <WidgetHelpTitle title={t('bi.profitLosingLabel')} help={PROFIT_HELP.losingList} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            {t('bi.profitLosingSub')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {lossMakers.map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitSoldStockCost', { n: row.units_sold, amount: formatMoney(Number(row.cogs), currency) })}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>
                  {formatMoney(Number(row.gross_profit), currency)}
                </span>
              </div>
            ))}
            {!lossMakers.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNoneRightNow')}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <WidgetHelpTitle title={t('bi.profitSoldProducts')} help={PROFIT_HELP.soldTable} />
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              {t('bi.profitSoldCountPeriod', { n: salesTotal })}
            </p>
          </div>
          <Button type="button" variant="neutral" onClick={exportCsv} disabled={!sales.length}>
            {t('bi.profitExportCsv')}
          </Button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  t('bi.profitColProduct'),
                  t('bi.profitColSold'),
                  t('bi.profitColCustomersPaid'),
                  t('bi.profitColDiscounts'),
                  t('bi.profitColStockPaid'),
                  t('bi.profitColYourProfit'),
                  t('bi.profitColYouKeep'),
                ].map((label) => (
                  <th
                    key={label}
                    style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row.product_id}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    {row.sku ? (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.sku}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{row.units_sold}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.revenue), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.discounts || 0), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.cogs), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                    {formatMoney(Number(row.gross_profit), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {row.margin_percent ?? '—'}%
                  </td>
                </tr>
              ))}
              {!sales.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitNoSalesInPeriod')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          total={salesTotal}
          offset={offset}
          pageSize={pageSize}
          label={t('bi.pagination.products')}
          onPageChange={setOffset}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setOffset(0);
          }}
        />
      </Card>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title={t('bi.profitPriceGaps')} help={PROFIT_HELP.priceGaps} />
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
            {t('bi.profitPriceGapsSub')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {topMargins.map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitSellCost', {
                      sell: formatMoney(Number(row.price), currency),
                      cost: formatMoney(Number(row.avg_cost || row.purchase_price), currency),
                    })}
                  </div>
                </div>
                <span style={{ fontWeight: 700 }}>{row.margin_percent}%</span>
              </div>
            ))}
            {!topMargins.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                {t('bi.profitAddPurchasePrice')}
              </p>
            ) : null}
          </div>
        </Card>
        <Card>
          <WidgetHelpTitle title={t('bi.profitThinGaps')} help={PROFIT_HELP.thinGaps} />
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
            {t('bi.profitThinGapsSub')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(stockRisk.length ? stockRisk : lowMargins).map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {stockRisk.length
                      ? t('bi.profitStockN', { n: row.stock_on_hand })
                      : t('bi.profitGapAmount', { amount: formatMoney(Number(row.margin), currency) })}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>{row.margin_percent}%</span>
              </div>
            ))}
            {!stockRisk.length && !lowMargins.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{t('bi.profitNothingFlagged')}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <WidgetHelpTitle title={t('bi.profitRewardPoints')} help={PROFIT_HELP.loyalty} />
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              {t('bi.profitRewardSub')}
            </p>
          </div>
          <Link to="/shop/loyalty" style={{ fontSize: 13, alignSelf: 'center' }}>
            {t('bi.profitFullActivity')}
          </Link>
        </div>

        {loyalty.isLoading ? (
          <p style={{ color: 'var(--muted-foreground)', marginTop: 12 }}>{t('bi.profitLoadingRewards')}</p>
        ) : null}

        {!loyalty.isLoading && !loyaltyEnabled ? (
          <p style={{ margin: '12px 0 0', color: '#b45309', fontSize: 13 }}>
            {t('bi.profitRewardsOff')}
          </p>
        ) : null}

        {loyaltySummary ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <StatCard
                label={t('bi.profitPointsGave')}
                help={PROFIT_HELP.loyaltyGiven}
                tone="success"
                value={loyaltySummary.points_earned}
                hint={t('bi.profitPointsGaveHint')}
              />
              <StatCard
                label={t('bi.profitPointsUsed')}
                help={PROFIT_HELP.loyaltyUsed}
                tone="warning"
                value={loyaltySummary.points_redeemed}
                hint={t('bi.profitPointsUsedHint')}
              />
              <StatCard
                label={t('bi.profitStillWithCustomers')}
                help={PROFIT_HELP.loyaltyNet}
                tone={Number(loyaltySummary.net_points) >= 0 ? 'info' : 'warning'}
                value={loyaltySummary.net_points}
                hint={
                  Number(loyaltySummary.net_points) >= 0
                    ? t('bi.profitMoreGiven')
                    : t('bi.profitMoreUsed')
                }
              />
              <StatCard
                label={t('bi.profitTimesMoved')}
                help={PROFIT_HELP.loyaltyMoves}
                tone="info"
                value={loyaltySummary.entry_count}
                hint={t('bi.profitGiveUseEvents')}
              />
              <StatCard
                label={t('bi.profitMoneyAsRewards')}
                help={PROFIT_HELP.loyaltyMoneyGiven}
                tone="warning"
                value={formatMoney(Number(loyaltySummary.redeem_discount_total || 0), currency)}
                hint={t('bi.profitMoneyAsRewardsHint')}
              />
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('bi.profitGivenVsUsed')}</h3>
              {loyaltyMix.length ? (
                <DonutPieChart data={loyaltyMix} centerLabel={t('bi.profitCenterPoints')} size={160} />
              ) : (
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>
                  {t('bi.profitNoPointsPeriod')}
                </p>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'end',
                  marginBottom: 10,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{t('bi.profitAllPointActivity')}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {t('bi.profitEntriesPeriod', { n: loyaltyTotal })}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    {t('bi.profitShow')}
                    <select
                      value={loyaltyDirection}
                      onChange={(event) => {
                        setLoyaltyDirection(event.target.value as 'all' | 'given' | 'used');
                        setLoyaltyOffset(0);
                      }}
                      style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                    >
                      <option value="all">{t('common.all')}</option>
                      <option value="given">{t('bi.profitGivenOnly')}</option>
                      <option value="used">{t('bi.profitUsedOnly')}</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    {t('common.search')}
                    <input
                      type="search"
                      value={loyaltyQ}
                      placeholder={t('bi.profitCustomerOrReason')}
                      onChange={(event) => setLoyaltyQ(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setLoyaltySearch(loyaltyQ.trim());
                          setLoyaltyOffset(0);
                        }
                      }}
                      style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 160 }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => {
                      setLoyaltySearch(loyaltyQ.trim());
                      setLoyaltyOffset(0);
                    }}
                  >
                    {t('bi.profitApply')}
                  </Button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {[
                        t('bi.profitColWhen'),
                        t('bi.profitColCustomer'),
                        t('bi.profitColWhatHappened'),
                        t('bi.profitColLinkedRecord'),
                        t('bi.profitColPointsProfit'),
                      ].map((label) => (
                        <th
                          key={label}
                          style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loyaltyLedger.map((row) => {
                      const sourceLabel = String(row.source_label || '').trim();
                      const isOnlineOrder =
                        sourceLabel === 'Online order' || sourceLabel.startsWith('Online order');
                      const invoiceVoucherId = String(row.invoice_voucher_id || row.voucher_id || '').trim();
                      const onlineOrderId = String(row.linked_order_id || row.order_id || '').trim();
                      const onlineHref =
                        isOnlineOrder && onlineOrderId ? `/shop/orders/${onlineOrderId}` : null;
                      const bookingFallbackHref =
                        !invoiceVoucherId && row.record_kind === 'booking' && row.booking_id
                          ? `/bookings/${row.booking_id}`
                          : null;
                      const recordText =
                        row.record_kind === 'order'
                          ? `${sourceLabel || t('bi.profitShopInvoice')} ${row.order_number || row.record_label || ''}`.trim()
                          : row.record_kind === 'booking'
                            ? t('bi.profitBookingRecord', { ref: row.booking_number || row.record_label || '' }).trim()
                            : row.record_kind === 'voucher'
                              ? row.voucher_type === 'purchase'
                                ? t('bi.profitBooksPurchase', { ref: row.voucher_number || '' }).trim()
                                : `${sourceLabel || t('bi.profitBooksSale')} ${row.voucher_number || ''}`.trim()
                              : '';
                      // Online → order page. POS / Booking / Books → invoice popup.
                      const openInvoice = Boolean(invoiceVoucherId) && !(isOnlineOrder && onlineOrderId);
                      const isBooking =
                        row.record_kind === 'booking' || sourceLabel === 'Booking';
                      const bothPoints =
                        Number(row.record_points_earned || 0) > 0 &&
                        Number(row.record_points_redeemed || 0) > 0;
                      const profitAmount =
                        !isBooking && row.gross_profit != null && row.gross_profit !== ''
                          ? Number(row.gross_profit)
                          : null;
                      const profitPositive = profitAmount != null && profitAmount >= 0;
                      const earnedPts =
                        Number(row.record_points_earned) ||
                        (row.points_delta > 0 ? row.points_delta : 0);
                      const redeemedPts =
                        Number(row.record_points_redeemed) ||
                        (row.points_delta < 0 ? Math.abs(row.points_delta) : 0);
                      const pointsTone =
                        bothPoints
                          ? 'neutral'
                          : redeemedPts > 0 && earnedPts <= 0
                            ? 'warning'
                            : 'positive';
                      return (
                        <tr key={row.id}>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {row.customer_id ? (
                              <Link to={`/customers/${row.customer_id}`}>{row.customer_name || t('bookings.customer')}</Link>
                            ) : (
                              row.customer_name || '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {bothPoints
                              ? t('bi.profitPointsGivenAndUsed')
                              : row.reason || row.entry_type || t('bi.profitPointsUpdate')}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {onlineHref && recordText ? (
                              <Link to={onlineHref}>{recordText}</Link>
                            ) : openInvoice && recordText ? (
                              <button
                                type="button"
                                onClick={() => setBooksInvoiceId(invoiceVoucherId)}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  padding: 0,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  font: 'inherit',
                                  textDecoration: 'underline',
                                }}
                              >
                                {recordText}
                              </button>
                            ) : bookingFallbackHref && recordText ? (
                              <Link to={bookingFallbackHref}>{recordText}</Link>
                            ) : recordText ? (
                              recordText
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                alignItems: 'center',
                              }}
                            >
                              <MetricTile
                                label={t('bi.profitPoints')}
                                icon="gift"
                                tone={pointsTone}
                                help={PROFIT_HELP.loyaltyRowPoints}
                                title={PROFIT_HELP.loyaltyRowPoints}
                                value={
                                  <>
                                    {earnedPts > 0 ? (
                                      <span style={{ color: '#0f766e' }}>+{earnedPts}</span>
                                    ) : null}
                                    {earnedPts > 0 && redeemedPts > 0 ? (
                                      <span style={{ color: 'var(--muted-foreground)' }}> · </span>
                                    ) : null}
                                    {redeemedPts > 0 ? (
                                      <span style={{ color: '#b45309' }}>−{redeemedPts}</span>
                                    ) : null}
                                    {!earnedPts && !redeemedPts ? '—' : null}
                                  </>
                                }
                              />
                              {profitAmount != null ? (
                                <MetricTile
                                  label={t('bi.profit')}
                                  icon="trending-up"
                                  tone={profitPositive ? 'positive' : 'negative'}
                                  help={PROFIT_HELP.loyaltyRowProfit}
                                  title={PROFIT_HELP.loyaltyRowProfit}
                                  value={formatMoney(profitAmount, currency)}
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loyaltyLedger.length ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                          {t('bi.profitNoMovements')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <TablePagination
                total={loyaltyTotal}
                offset={loyaltyOffset}
                pageSize={loyaltyPageSize}
                label={t('bi.pagination.entries')}
                onPageChange={setLoyaltyOffset}
                onPageSizeChange={(size) => {
                  setLoyaltyPageSize(size);
                  setLoyaltyOffset(0);
                }}
              />
            </div>
          </div>
        ) : !loyalty.isLoading && loyaltyEnabled ? (
          <p style={{ color: 'var(--muted-foreground)', marginTop: 12 }}>{t('bi.profitNoRewardsYet')}</p>
        ) : null}
      </Card>

      <BooksInvoiceDrawer
        voucherId={booksInvoiceId}
        open={Boolean(booksInvoiceId)}
        onClose={() => setBooksInvoiceId(null)}
      />
      </>
      ) : null}

      {!appointieProfit.isLoading && !insights.isLoading && !showAppointie && !showShopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.profitNotIncluded')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIProfitPage;
