import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformMonitoringQuery } from '../settings/billingHooks';

export function PlatformMonitoringPage() {
  usePageMeta({ title: 'Monitoring — Platform Admin' });
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, true);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Monitoring Center</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Webhook failures, dead-letter events, and impacted tenants.
        </p>
      </Card>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Card>
          <strong>Failed events</strong>
          <p style={{ marginBottom: 0 }}>{monitoringQuery.data?.failed_events ?? '...'}</p>
        </Card>
        <Card>
          <strong>Dead-letter</strong>
          <p style={{ marginBottom: 0 }}>{monitoringQuery.data?.dead_letter_events ?? '...'}</p>
        </Card>
        <Card>
          <strong>Reprocess actions</strong>
          <p style={{ marginBottom: 0 }}>{monitoringQuery.data?.reprocess_actions ?? '...'}</p>
        </Card>
        <Card>
          <strong>Tenants impacted</strong>
          <p style={{ marginBottom: 0 }}>{monitoringQuery.data?.tenants_impacted ?? '...'}</p>
        </Card>
      </div>
    </div>
  );
}

export default PlatformMonitoringPage;
