import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  useBillingPlatformAuditFeedQuery,
  useBillingPlatformMonitoringQuery,
  useBillingPlatformOpsSummaryQuery,
  useBillingPlatformSubscriptionsQuery,
} from '../settings/billingHooks';
import { useState } from 'react';

export function PlatformAdminPage() {
  usePageMeta({ title: 'Platform Admin — AppointIE' });
  const [enabled, setEnabled] = useState(false);
  const opsQuery = useBillingPlatformOpsSummaryQuery(24, 100, enabled);
  const subsQuery = useBillingPlatformSubscriptionsQuery(enabled);
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, enabled);
  const auditFeedQuery = useBillingPlatformAuditFeedQuery(25, enabled);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Platform Admin</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Multi-tenant readiness and subscription management summary.
        </p>
        <Button variant="ghost" onClick={() => setEnabled(true)} disabled={enabled && (opsQuery.isLoading || subsQuery.isLoading)}>
          {enabled ? 'Refresh summary' : 'Load platform summary'}
        </Button>
      </Card>

      {opsQuery.error ? (
        <Card>
          <p style={{ margin: 0, color: '#991b1b' }}>
            {opsQuery.error.message || 'Platform admin access is required.'}
          </p>
        </Card>
      ) : null}

      {opsQuery.data ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Tenant readiness</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Total: {opsQuery.data.tenant_count} · Ready: {opsQuery.data.ready_count} · Not ready:{' '}
            {opsQuery.data.not_ready_count}
          </p>
        </Card>
      ) : null}

      {monitoringQuery.data ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Monitoring</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Failed events: {monitoringQuery.data.failed_events} · Dead-letter events:{' '}
            {monitoringQuery.data.dead_letter_events} · Reprocess actions:{' '}
            {monitoringQuery.data.reprocess_actions} · Tenants impacted:{' '}
            {monitoringQuery.data.tenants_impacted}
          </p>
        </Card>
      ) : null}

      {subsQuery.data ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Subscriptions snapshot</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Total subscriptions: {subsQuery.data.total_subscriptions}
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {subsQuery.data.by_status.map((row) => (
              <div key={row.status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize' }}>{row.status}</span>
                <span>{row.count}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {auditFeedQuery.data ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Audit feed</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {auditFeedQuery.data.rows.slice(0, 20).map((row) => (
              <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <strong>{row.action}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  Tenant {row.tenant_id} · {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default PlatformAdminPage;
