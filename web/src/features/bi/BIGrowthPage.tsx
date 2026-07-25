import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { useBIGrowthQuery } from './biHooks';

export function BIGrowthPage() {
  usePageMeta({ title: 'BI Growth — AppointIE' });
  const growthQuery = useBIGrowthQuery();
  const data = growthQuery.data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Customer growth</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          New vs returning customers and who books most often (last 30 days).
        </p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="New customers" value={growthQuery.isLoading ? '...' : data?.new_customers ?? 0} />
        <StatCard label="Returning" value={growthQuery.isLoading ? '...' : data?.returning_customers ?? 0} />
        <StatCard
          label="Repeat rate"
          value={growthQuery.isLoading ? '...' : `${Math.round((data?.repeat_rate ?? 0) * 100)}%`}
        />
        <StatCard
          label="Avg visits / customer"
          value={growthQuery.isLoading ? '...' : data?.avg_visits_per_customer ?? 0}
        />
      </div>
      <Card>
        <h2 style={{ marginTop: 0 }}>Most active customers</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data?.top_customers ?? []).length ? (
            (data?.top_customers ?? []).map((row) => (
              <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.bookings} bookings · {row.is_returning ? 'returning' : 'new'}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{Number(row.revenue).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>No customer booking activity in this period yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default BIGrowthPage;
