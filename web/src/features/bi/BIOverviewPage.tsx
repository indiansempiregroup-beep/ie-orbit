import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIOverviewQuery } from './biHooks';

export function BIOverviewPage() {
  usePageMeta({ title: 'BI Overview — AppointIE' });
  const overviewQuery = useBIOverviewQuery();
  const data = overviewQuery.data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Overview</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Business intelligence snapshot for the last 30 days.</p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Total bookings" value={overviewQuery.isLoading ? '...' : data?.summary.bookings ?? 0} />
        <StatCard label="Completed" value={overviewQuery.isLoading ? '...' : data?.summary.completed ?? 0} />
        <StatCard label="Cancelled" value={overviewQuery.isLoading ? '...' : data?.summary.cancelled ?? 0} />
        <StatCard
          label="Estimated revenue"
          value={overviewQuery.isLoading ? '...' : `${data?.revenue.currency ?? ''} ${data?.revenue.estimated_revenue ?? 0}`}
        />
      </div>
      <Card>
        <h2 style={{ marginTop: 0 }}>Booking trend</h2>
        {data?.trends.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No trend data yet.</p>}
      </Card>
    </div>
  );
}

export default BIOverviewPage;
