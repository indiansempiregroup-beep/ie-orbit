import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useDashboardSummary } from '../dashboard/dashboardHooks';
import { StatCard } from '../bi/components/StatCard';
import { useBIReportsQuery } from '../bi/biHooks';

function money(amount?: number | null, currency?: string | null) {
  if (amount == null) return '—';
  return `${currency ?? ''} ${Number(amount).toFixed(2)}`.trim();
}

function pct(value?: number | null) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function ReportsPage() {
  usePageMeta({ title: 'Reports — Orbit Appoint' });
  const navigate = useNavigate();
  const summaryQuery = useDashboardSummary();
  const reportsQuery = useBIReportsQuery();
  const summary = summaryQuery.data;
  const reports = reportsQuery.data;
  const appointie = summary?.appointie;
  const shopie = summary?.shopie;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Operational summary</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: 16 }}>
          Today’s snapshot plus the last 30 days of Orbit Appoint activity. Open Business Intelligence for full
          charts and deeper breakdowns.
        </p>
        <Button variant="neutral" onClick={() => navigate('/bi/reports')}>
          Open Business Intelligence
        </Button>
      </Card>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Today’s bookings" value={appointie?.today_bookings ?? summary?.today_count ?? 0} />
        <StatCard label="Upcoming · 7d" value={appointie?.upcoming_7d ?? 0} />
        <StatCard
          label="Est. revenue · today"
          value={money(appointie?.estimated_revenue_today, summary?.currency)}
        />
        <StatCard label="Active customers" value={appointie?.active_customers ?? 0} />
        {shopie ? (
          <>
            <StatCard label="Orders · today" value={shopie.orders_today} />
            <StatCard label="GMV · today" value={money(shopie.gmv_today, summary?.currency)} />
          </>
        ) : null}
      </div>

      <Card>
        <h2 style={{ marginTop: 0 }}>Last 30 days</h2>
        <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>From the operations report bundle.</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <StatCard label="Bookings" value={reports?.summary.bookings ?? 0} />
          <StatCard label="Completion" value={pct(reports?.summary.completion_rate)} />
          <StatCard
            label="Est. revenue"
            value={money(reports?.revenue.estimated_revenue, reports?.revenue.currency ?? summary?.currency)}
          />
          <StatCard label="Repeat rate" value={pct(reports?.growth?.repeat_rate)} />
        </div>
      </Card>

      {(reports?.insights ?? []).length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Insights</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {(reports?.insights ?? []).map((insight) => (
              <div key={`${insight.type}-${insight.title}`}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{insight.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default ReportsPage;
