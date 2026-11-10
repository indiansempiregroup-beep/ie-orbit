import type { BIReportsBundle, BIShopieReports } from '@ie-orbit/sdk';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIReportsQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieReports({ data }: { data: BIReportsBundle }) {
  const { t } = useTranslation();
  const operations = data.operations;
  const currency = data.revenue?.currency;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.appoint')} subtitle={t('bi.appointReportsSub')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.bookings')} value={data.summary?.bookings ?? 0} />
        <StatCard label={t('bi.completionRate')} value={`${Math.round((data.summary?.completion_rate ?? 0) * 100)}%`} />
        <StatCard label={t('bi.revenue')} value={formatMoney(data.revenue?.estimated_revenue ?? 0, currency)} />
        <StatCard label={t('bi.repeatRate')} value={`${Math.round((data.growth?.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label={t('bi.newCustomers')} value={data.growth?.new_customers ?? 0} />
        <StatCard label={t('bi.noShows')} value={data.summary?.no_shows ?? 0} />
      </div>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('dashboard.insights')}</h3>
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

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('bi.trend')}</h3>
        {data.trends?.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>{t('bi.noDataInRange')}</p>}
      </Card>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.staffPerformance')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.completedCancelledNoShow', {
                      completed: row.completed,
                      cancelled: row.cancelled,
                      noShows: row.no_shows,
                    })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{t('bi.bookingsN', { n: row.bookings })}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {formatMoney(row.revenue, currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ShopieReports({ data }: { data: BIShopieReports }) {
  const { t } = useTranslation();
  const currency = data.currency ?? data.revenue?.currency ?? undefined;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.mart')} subtitle={t('bi.martReportsSub')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.orders')} value={data.orders ?? 0} />
        <StatCard label={t('bi.gmv')} value={formatMoney(data.gmv ?? 0, currency)} />
        <StatCard label={t('bi.avgOrderValue')} value={formatMoney(data.avg_order_value ?? 0, currency)} />
        <StatCard label={t('bi.repeatRate')} value={`${Math.round((data.growth?.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label={t('bi.newCustomers')} value={data.growth?.new_customers ?? 0} />
        <StatCard label={t('bi.returns')} value={data.returns ?? 0} />
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

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('bi.orderTrend')}</h3>
        {data.trend?.length ? (
          <TrendChart
            rows={data.trend.map((row) => ({
              day: row.day,
              total: row.orders,
              completed: row.orders,
              cancelled: 0,
            }))}
          />
        ) : (
          <p>{t('bi.noDataInRange')}</p>
        )}
      </Card>
    </div>
  );
}

export function BIReportsPage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t('bi.pageReports')} — Orbit` });
  const { showAppointie, showShopie } = useBiProductVisibility('reports');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const reportsQuery = useBIReportsQuery();
  const data = reportsQuery.data;
  const appointie =
    data?.appointie ??
    (showAppointie && data?.summary && data?.revenue && data?.trends ? (data as BIReportsBundle) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.pageReports')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          {showSwitcher ? t('bi.reportsIntroSwitch') : t('bi.reportsIntro')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {reportsQuery.isLoading && !data ? <Card>{t('bi.loadingReports')}</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? <AppointieReports data={appointie} /> : null}
      {product === 'shopie' && showShopie && shopie ? <ShopieReports data={shopie} /> : null}
      {!reportsQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.reportsEmpty')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIReportsPage;
