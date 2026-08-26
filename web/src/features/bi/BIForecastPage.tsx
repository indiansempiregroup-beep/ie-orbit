import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { useBIForecastQuery } from './biHooks';

export function BIForecastPage() {
  usePageMeta({ title: 'BI Forecast — Orbit Appoint' });
  const forecastQuery = useBIForecastQuery(30);
  const forecast = forecastQuery.data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Forecast</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Projection for the next {forecast?.horizon_days ?? 30} days based on the last{' '}
          {forecast?.based_on_days ?? 30} days ({forecast?.based_on_bookings ?? 0} bookings).
        </p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Horizon" value={`${forecast?.horizon_days ?? 30} days`} />
        <StatCard label="Projected bookings" value={forecastQuery.isLoading ? '...' : forecast?.projected_bookings ?? 0} />
        <StatCard
          label="Projected revenue"
          value={
            forecastQuery.isLoading
              ? '...'
              : `${forecast?.currency ?? ''} ${(forecast?.projected_revenue ?? 0).toFixed(2)}`
          }
        />
        <StatCard
          label="Avg daily bookings"
          value={forecastQuery.isLoading ? '...' : forecast?.avg_daily_bookings ?? 0}
        />
        <StatCard
          label="Avg daily revenue"
          value={
            forecastQuery.isLoading
              ? '...'
              : `${forecast?.currency ?? ''} ${(forecast?.avg_daily_revenue ?? 0).toFixed(2)}`
          }
        />
      </div>
    </div>
  );
}

export default BIForecastPage;
