import type { BIForecastReport, BIShopieForecast } from '@ie-orbit/sdk';
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
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading
        title="Orbit Appoint"
        subtitle={
          data.note ||
          `Projection for the next ${data.horizon_days ?? 30} days based on the last ${data.based_on_days ?? 30} days (${data.based_on_bookings ?? 0} bookings).`
        }
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Horizon" value={`${data.horizon_days ?? 30} days`} />
        <StatCard label="Projected bookings" value={data.projected_bookings ?? 0} />
        <StatCard label="Projected revenue" value={formatMoney(data.projected_revenue ?? 0, data.currency)} />
        <StatCard label="Avg daily bookings" value={data.avg_daily_bookings ?? 0} />
        <StatCard label="Avg daily revenue" value={formatMoney(data.avg_daily_revenue ?? 0, data.currency)} />
      </div>
    </div>
  );
}

function ShopieForecast({ data }: { data: BIShopieForecast }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading
        title="Orbit Mart"
        subtitle={
          data.note ||
          `Projection for the next ${data.horizon_days ?? 30} days based on the last ${data.based_on_days ?? 30} days (${data.based_on_orders ?? 0} orders).`
        }
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Horizon" value={`${data.horizon_days ?? 30} days`} />
        <StatCard label="Projected orders" value={data.projected_orders ?? 0} />
        <StatCard label="Projected GMV" value={formatMoney(data.projected_revenue ?? 0, data.currency)} />
        <StatCard label="Avg daily orders" value={data.avg_daily_orders ?? 0} />
        <StatCard label="Avg daily GMV" value={formatMoney(data.avg_daily_revenue ?? 0, data.currency)} />
      </div>
    </div>
  );
}

export function BIForecastPage() {
  usePageMeta({ title: 'BI Forecast — Orbit' });
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
        <h1 style={{ marginTop: 0 }}>BI Forecast</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          {showSwitcher
            ? 'Next 30 days from recent pace. Appoint projects bookings; Mart projects orders and GMV.'
            : showShopie
              ? 'Next 30 days from recent shop order pace.'
              : 'Next 30 days from recent booking pace.'}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {forecastQuery.isLoading && !data ? <Card>Loading forecast…</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? <AppointieForecast data={appointie} /> : null}
      {product === 'shopie' && showShopie && shopie ? <ShopieForecast data={shopie} /> : null}
      {!forecastQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            No forecast for your subscribed products yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIForecastPage;
