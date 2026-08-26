import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIReportsQuery } from './biHooks';

export function BIReportsPage() {
  usePageMeta({ title: 'BI Reports — Orbit Appoint' });
  const reportsQuery = useBIReportsQuery();
  const data = reportsQuery.data;
  const operations = data?.operations;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Reports</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Combined operational, revenue, and customer reporting for the last 30 days.
        </p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Bookings" value={data?.summary.bookings ?? 0} />
        <StatCard label="Completion rate" value={`${Math.round((data?.summary.completion_rate ?? 0) * 100)}%`} />
        <StatCard
          label="Revenue"
          value={`${data?.revenue.currency ?? ''} ${data?.revenue.estimated_revenue ?? 0}`}
        />
        <StatCard label="Repeat rate" value={`${Math.round((data?.growth?.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label="New customers" value={data?.growth?.new_customers ?? 0} />
        <StatCard label="No-shows" value={data?.summary.no_shows ?? 0} />
      </div>

      {(data?.insights ?? []).length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Insights</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data?.insights ?? []).map((insight) => (
              <div key={`${insight.type}-${insight.title}`}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{insight.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 style={{ marginTop: 0 }}>Trend</h2>
        {data?.trends.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No data in range.</p>}
      </Card>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Staff performance</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.completed} completed · {row.cancelled} cancelled · {row.no_shows} no-show
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{row.bookings} bookings</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {data?.revenue.currency} {row.revenue.toFixed(2)}
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

export default BIReportsPage;
