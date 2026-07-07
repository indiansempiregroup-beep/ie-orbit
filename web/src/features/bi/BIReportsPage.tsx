import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIReportsQuery } from './biHooks';

export function BIReportsPage() {
  usePageMeta({ title: 'BI Reports — AppointIE' });
  const reportsQuery = useBIReportsQuery();
  const data = reportsQuery.data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Reports</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Combined operational and revenue reporting.</p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Bookings" value={data?.summary.bookings ?? 0} />
        <StatCard label="Completion rate" value={`${Math.round((data?.summary.completion_rate ?? 0) * 100)}%`} />
        <StatCard label="Revenue" value={`${data?.revenue.currency ?? ''} ${data?.revenue.estimated_revenue ?? 0}`} />
      </div>
      <Card>
        <h2 style={{ marginTop: 0 }}>Trend</h2>
        {data?.trends.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No data in range.</p>}
      </Card>
    </div>
  );
}

export default BIReportsPage;
