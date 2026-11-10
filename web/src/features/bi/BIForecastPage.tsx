import type { BIForecastReport, BIShopieForecast } from '@ie-orbit/sdk';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { useBIForecastQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieForecast({ data }: { data: BIForecastReport }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading
        title={t('public.nav.appoint')}
        subtitle={
          data.note ||
          t('bi.projectionBookings', {
            horizon: data.horizon_days ?? 30,
            based: data.based_on_days ?? 30,
            n: data.based_on_bookings ?? 0,
          })
        }
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.horizon')} value={t('bi.daysN', { n: data.horizon_days ?? 30 })} />
        <StatCard label={t('bi.projectedBookings')} value={data.projected_bookings ?? 0} />
        <StatCard label={t('bi.projectedRevenue')} value={formatMoney(data.projected_revenue ?? 0, data.currency)} />
        <StatCard label={t('bi.avgDailyBookings')} value={data.avg_daily_bookings ?? 0} />
        <StatCard label={t('bi.avgDailyRevenue')} value={formatMoney(data.avg_daily_revenue ?? 0, data.currency)} />
      </div>
    </div>
  );
}

function ShopieForecast({ data }: { data: BIShopieForecast }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading
        title={t('public.nav.mart')}
        subtitle={
          data.note ||
          t('bi.projectionOrders', {
            horizon: data.horizon_days ?? 30,
            based: data.based_on_days ?? 30,
            n: data.based_on_orders ?? 0,
          })
        }
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.horizon')} value={t('bi.daysN', { n: data.horizon_days ?? 30 })} />
        <StatCard label={t('bi.projectedOrders')} value={data.projected_orders ?? 0} />
        <StatCard label={t('bi.projectedGmv')} value={formatMoney(data.projected_revenue ?? 0, data.currency)} />
        <StatCard label={t('bi.avgDailyOrders')} value={data.avg_daily_orders ?? 0} />
        <StatCard label={t('bi.avgDailyGmv')} value={formatMoney(data.avg_daily_revenue ?? 0, data.currency)} />
      </div>
    </div>
  );
}

export function BIForecastPage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t('bi.pageForecast')} — Orbit` });
  const { showAppointie, showShopie } = useBiProductVisibility('forecast');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const forecastQuery = useBIForecastQuery(30);
  const data = forecastQuery.data;
  const appointie =
    data?.appointie ??
    (showAppointie && data?.projected_bookings != null ? (data as BIForecastReport) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.pageForecast')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          {showSwitcher
            ? t('bi.forecastIntroSwitch')
            : showShopie
              ? t('bi.forecastIntroMart')
              : t('bi.forecastIntroAppoint')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {forecastQuery.isLoading && !data ? <Card>{t('bi.loadingForecast')}</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? <AppointieForecast data={appointie} /> : null}
      {product === 'shopie' && showShopie && shopie ? <ShopieForecast data={shopie} /> : null}
      {!forecastQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.forecastEmpty')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIForecastPage;
