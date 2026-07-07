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
          Revenue projection based on bookings in the selected window.
        </p>
      </Card>
      <StatCard
        label="Estimated booking revenue (30d)"
        value={
          revenueQuery.isLoading
            ? '...'
            : `${revenue?.currency ?? ''} ${(revenue?.estimated_revenue ?? 0).toFixed(2)}`
        }
      />
      <Card>
        <h2 style={{ marginTop: 0 }}>Revenue by service</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(revenue?.by_service ?? []).map((row) => (
            <div key={row.service_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{row.service_name}</span>
              <span>
                {revenue?.currency} {row.revenue.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default BIRevenuePage;
