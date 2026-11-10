import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIOverviewQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';
import type { TFunction } from 'i18next';
import type {
  BIForecastReport,
  BIOverviewResponse,
  BIReportsBundle,
  BIShopieOverview,
  DashboardPetsSummary,
} from '@ie-orbit/sdk';

function changeHint(t: TFunction, value?: number | null) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return t('bi.changeVsPrior', { value: `${prefix}${value}` });
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieBlock({ data }: { data: BIReportsBundle }) {
  const { t } = useTranslation();
  const summary = data.summary;
  const operations = data.operations;
  const weekdayMax = Math.max(...(operations?.by_weekday ?? []).map((row) => row.total), 1);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.appoint')} subtitle={t('bi.appointOverviewSub')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard
          label={t('bi.totalBookings')}
          value={summary?.bookings ?? 0}
          hint={changeHint(t, summary?.comparison?.bookings_change_pct)}
        />
        <StatCard
          label={t('bi.estimatedRevenue')}
          value={formatMoney(data.revenue?.estimated_revenue ?? 0, data.revenue?.currency)}
          hint={changeHint(t, summary?.comparison?.revenue_change_pct)}
        />
        <StatCard
          label={t('bi.completed')}
          value={summary?.completed ?? 0}
          hint={t('bi.completionPct', { pct: Math.round((summary?.completion_rate ?? 0) * 100) })}
        />
        <StatCard
          label={t('bi.noShows')}
          value={summary?.no_shows ?? 0}
          hint={t('bi.ofBookingsPct', { pct: Math.round((summary?.no_show_rate ?? 0) * 100) })}
        />
        <StatCard
          label={t('bi.cancelled')}
          value={summary?.cancelled ?? 0}
          hint={t('bi.ofBookingsPct', { pct: Math.round((summary?.cancellation_rate ?? 0) * 100) })}
        />
        <StatCard
          label={t('bi.avgBookingsPerDay')}
          value={summary?.avg_bookings_per_day ?? 0}
          hint={operations?.busiest_day ? t('bi.busiestDay', { day: operations.busiest_day }) : undefined}
        />
      </div>

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

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.bookingTrend')}</h3>
          {data.trends?.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>{t('bi.noTrendData')}</p>}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.demandByWeekday')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_weekday ?? []).map((row) => (
              <div
                key={row.weekday}
                style={{ display: 'grid', gridTemplateColumns: '72px 1fr 40px', gap: 10, alignItems: 'center' }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.weekday_name.slice(0, 3)}</span>
                <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(row.total / weekdayMax) * 100}%`,
                      height: '100%',
                      background: 'var(--primary)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12 }}>{row.total}</span>
              </div>
            ))}
          </div>
          {operations?.busiest_hour ? (
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>
              {t('bi.peakHour', { hour: operations.busiest_hour })}
            </p>
          ) : null}
        </Card>
      </div>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.topStaff')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).slice(0, 6).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.completedNoShow', { completed: row.completed, noShows: row.no_shows })}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{t('bi.bookingsN', { n: row.bookings })}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ShopieBlock({ data }: { data: BIShopieOverview }) {
  const { t } = useTranslation();
  const currency = data.currency ?? '';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.mart')} subtitle={t('bi.martOverviewSub')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.orders')} value={data.orders} />
        <StatCard label={t('bi.gmv')} value={formatMoney(Number(data.gmv ?? 0), currency)} />
        <StatCard label={t('bi.avgOrderValue')} value={formatMoney(Number(data.avg_order_value ?? 0), currency)} />
        <StatCard
          label={t('bi.returns')}
          value={data.returns}
          hint={t('bi.returnsPct', { pct: Math.round((data.return_rate ?? 0) * 100) })}
        />
        <StatCard label={t('dashboard.pendingReturns')} value={data.pending_returns} />
        <StatCard label={t('bi.refunds')} value={formatMoney(Number(data.refund_total ?? 0), currency)} />
        <StatCard label={t('bi.deliveryFees')} value={formatMoney(Number(data.delivery_fee_total ?? 0), currency)} />
        <StatCard label={t('bi.cancelledOrders')} value={data.cancelled_orders} />
      </div>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.commerceInsights')}</h3>
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

      {data.trend?.length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.orderVolume')}</h3>
          <TrendChart
            rows={data.trend.map((row) => ({
              day: row.day,
              total: row.orders,
              completed: row.orders,
              cancelled: 0,
            }))}
          />
        </Card>
      ) : null}
    </div>
  );
}

function ForecastBlock({ data }: { data: BIForecastReport }) {
  const { t } = useTranslation();
  return (
    <Card>
      <SectionHeading
        title={t('bi.nextDays', { days: data.horizon_days ?? 30 })}
        subtitle={data.note || t('bi.projectedFromPace')}
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.projectedBookings')} value={data.projected_bookings ?? 0} />
        <StatCard
          label={t('bi.projectedRevenue')}
          value={formatMoney(Number(data.projected_revenue ?? 0), data.currency)}
        />
        <StatCard label={t('bi.avgDailyBookings')} value={data.avg_daily_bookings ?? 0} />
        <StatCard
          label={t('bi.avgDailyRevenue')}
          value={formatMoney(Number(data.avg_daily_revenue ?? 0), data.currency)}
        />
      </div>
    </Card>
  );
}

function PetsBlock({ data }: { data: DashboardPetsSummary }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('dashboard.petsPack')} subtitle={t('dashboard.petsPackSubtitle')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('dashboard.petsEnrolled')} value={data.total} />
        <StatCard label={t('dashboard.birthdays7d')} value={data.birthdays_next_7d} />
        <StatCard label={t('dashboard.birthdays30d')} value={data.birthdays_next_30d} />
        <StatCard label={t('dashboard.withPhoto')} value={data.with_photo} />
      </div>
      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.petInsights')}</h3>
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
    </div>
  );
}

function resolveAppointie(data?: BIOverviewResponse | null): BIReportsBundle | null {
  if (!data) return null;
  if (data.appointie) return data.appointie;
  if (data.summary && data.revenue && data.trends) {
    return {
      summary: data.summary,
      revenue: data.revenue,
      trends: data.trends,
      growth: data.growth,
      operations: data.operations,
      insights: data.insights,
    };
  }
  return null;
}

export function BIOverviewPage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t('bi.pageOverview')} — IE Orbit` });
  const { showAppointie, showShopie } = useBiProductVisibility('overview');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const overviewQuery = useBIOverviewQuery();
  const data = overviewQuery.data as BIOverviewResponse | undefined;
  const appointie = resolveAppointie(data);
  const shopie = data?.shopie;
  const pets = data?.pets;
  const forecast = data?.forecast ?? data?.appointie?.forecast;
  const showAppointiePane = product === 'appointie' && showAppointie;
  const showShopiePane = product === 'shopie' && showShopie;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.pageOverview')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : 0 }}>
          {showSwitcher
            ? t('bi.overviewIntroSwitch')
            : showShopie
              ? t('bi.overviewIntroMart')
              : showAppointie
                ? t('bi.overviewIntroAppoint')
                : t('bi.overviewIntro')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>

      {overviewQuery.isLoading && !data ? <Card>{t('bi.loadingOverview')}</Card> : null}

      {showAppointiePane && appointie ? <AppointieBlock data={appointie} /> : null}
      {showAppointiePane && forecast ? <ForecastBlock data={forecast} /> : null}
      {showShopiePane && shopie ? <ShopieBlock data={shopie} /> : null}
      {showShopiePane && pets ? <PetsBlock data={pets} /> : null}

      {!overviewQuery.isLoading && !appointie && !shopie && !pets ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.overviewEmpty')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIOverviewPage;
