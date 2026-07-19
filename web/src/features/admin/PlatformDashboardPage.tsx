import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { formatTimestamp } from '../../lib/datetime';
import {
  useBillingPlatformAuditFeedQuery,
  useBillingPlatformMonitoringQuery,
  useBillingPlatformOpsSummaryQuery,
  useBillingPlatformSubscriptionsQuery,
} from '../settings/billingHooks';
import { usePlatformTenantsQuery } from './adminHooks';

export function PlatformDashboardPage() {
  const tenantsQuery = usePlatformTenantsQuery();
  const opsQuery = useBillingPlatformOpsSummaryQuery(24, 100, true);
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, true);
  const auditFeedQuery = useBillingPlatformAuditFeedQuery(10, true);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Platform Dashboard</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Cross-tenant readiness, subscriptions, and operational health.
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Card>
          <strong>Tenants</strong>
          <p style={{ marginBottom: 0 }}>{tenantsQuery.isLoading ? '...' : tenantsQuery.data?.length ?? 0}</p>
        </Card>
        <Card>
          <strong>Ready tenants</strong>
          <p style={{ marginBottom: 0 }}>{opsQuery.data?.ready_count ?? '...'}</p>
        </Card>
        <Card>
          <strong>Subscriptions</strong>
          <p style={{ marginBottom: 0 }}>{subsQuery.data?.total_subscriptions ?? '...'}</p>
        </Card>
        <Card>
          <strong>Failed events (24h)</strong>
          <p style={{ marginBottom: 0 }}>{monitoringQuery.data?.failed_events ?? '...'}</p>
        </Card>
      </div>

      {auditFeedQuery.data ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Recent audit activity</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {auditFeedQuery.data.rows.slice(0, 8).map((row) => (
              <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <strong>{row.action}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  Tenant {row.tenant_id} · {formatTimestamp(row.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Button variant="ghost" onClick={() => window.location.reload()}>
        Refresh dashboard
      </Button>
    </div>
  );
}

export default PlatformDashboardPage;
