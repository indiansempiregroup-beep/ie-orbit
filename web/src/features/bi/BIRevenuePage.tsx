import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { useBIRevenueQuery } from './biHooks';

export function BIRevenuePage() {
  usePageMeta({ title: 'BI Revenue — AppointIE' });
  const revenueQuery = useBIRevenueQuery();
  const revenue = revenueQuery.data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Revenue</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Estimated from service list prices × bookings in the last 30 days.
        </p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard
          label="Estimated revenue"
          value={
            revenueQuery.isLoading
              ? '...'
              : `${revenue?.currency ?? ''} ${(revenue?.estimated_revenue ?? 0).toFixed(2)}`
          }
        />
        <StatCard
          label="Completed revenue"
          value={
            revenueQuery.isLoading
              ? '...'
              : `${revenue?.currency ?? ''} ${(revenue?.completed_revenue ?? 0).toFixed(2)}`
          }
        />
        <StatCard
          label="Avg booking value"
          value={
            revenueQuery.isLoading
              ? '...'
              : `${revenue?.currency ?? ''} ${(revenue?.avg_booking_value ?? 0).toFixed(2)}`
          }
        />
      </div>
      <Card>
        <h2 style={{ marginTop: 0 }}>Revenue by service</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(revenue?.by_service ?? []).length ? (
            (revenue?.by_service ?? []).map((row) => (
              <div key={row.service_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.service_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.bookings ?? 0} bookings · {row.completed ?? 0} completed
                  </div>
                </div>
                <span>
                  {revenue?.currency} {row.revenue.toFixed(2)}
                </span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>No priced bookings in this period yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default BIRevenuePage;
