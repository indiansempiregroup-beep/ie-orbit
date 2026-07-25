import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIOverviewQuery } from './biHooks';

function changeHint(value?: number | null) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}% vs prior period`;
}

export function BIOverviewPage() {
  usePageMeta({ title: 'BI Overview — AppointIE' });
  const overviewQuery = useBIOverviewQuery();
  const data = overviewQuery.data;
  const summary = data?.summary;
  const operations = data?.operations;
  const weekdayMax = Math.max(...(operations?.by_weekday ?? []).map((row) => row.total), 1);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Overview</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Business intelligence snapshot for the last 30 days — bookings, revenue, demand, and what stands out.
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard
          label="Total bookings"
          value={overviewQuery.isLoading ? '...' : summary?.bookings ?? 0}
          hint={changeHint(summary?.comparison?.bookings_change_pct)}
        />
        <StatCard
          label="Estimated revenue"
          value={
            overviewQuery.isLoading
              ? '...'
              : `${data?.revenue.currency ?? ''} ${data?.revenue.estimated_revenue ?? 0}`
          }
          hint={changeHint(summary?.comparison?.revenue_change_pct)}
        />
        <StatCard
          label="Completed"
          value={overviewQuery.isLoading ? '...' : summary?.completed ?? 0}
          hint={`${Math.round((summary?.completion_rate ?? 0) * 100)}% completion`}
        />
        <StatCard
          label="No-shows"
          value={overviewQuery.isLoading ? '...' : summary?.no_shows ?? 0}
          hint={`${Math.round((summary?.no_show_rate ?? 0) * 100)}% of bookings`}
        />
        <StatCard
          label="Cancelled"
          value={overviewQuery.isLoading ? '...' : summary?.cancelled ?? 0}
          hint={`${Math.round((summary?.cancellation_rate ?? 0) * 100)}% of bookings`}
        />
        <StatCard
          label="Avg bookings / day"
          value={overviewQuery.isLoading ? '...' : summary?.avg_bookings_per_day ?? 0}
          hint={operations?.busiest_day ? `Busiest: ${operations.busiest_day}` : undefined}
        />
      </div>

      {(data?.insights ?? []).length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>What stands out</h2>
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

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <h2 style={{ marginTop: 0 }}>Booking trend</h2>
          {data?.trends.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No trend data yet.</p>}
        </Card>
        <Card>
          <h2 style={{ marginTop: 0 }}>Demand by weekday</h2>
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
              Peak hour around {operations.busiest_hour}.
            </p>
          ) : null}
        </Card>
      </div>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Top staff</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).slice(0, 6).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.completed} completed · {row.no_shows} no-show
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{row.bookings} bookings</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default BIOverviewPage;
