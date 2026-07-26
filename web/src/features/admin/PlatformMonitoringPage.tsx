import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformMonitoringQuery } from '../settings/billingHooks';
import { AdminKpi, AdminPageHeader, AdminSection } from './AdminChrome';

export function PlatformMonitoringPage() {
  usePageMeta({ title: 'Monitoring — Platform Admin' });
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, true);
  const failed = monitoringQuery.data?.failed_events ?? 0;

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Monitoring center"
        description="Webhook failures, dead-letter events, and impacted tenants over the last 24 hours."
      />
      <div className="admin-kpi-grid">
        <AdminKpi
          label="Failed events"
          value={monitoringQuery.data?.failed_events ?? '…'}
          tone={failed > 0 ? 'danger' : 'good'}
        />
        <AdminKpi
          label="Dead-letter"
          value={monitoringQuery.data?.dead_letter_events ?? '…'}
          tone="warn"
        />
        <AdminKpi label="Reprocess actions" value={monitoringQuery.data?.reprocess_actions ?? '…'} />
        <AdminKpi label="Tenants impacted" value={monitoringQuery.data?.tenants_impacted ?? '…'} />
      </div>
      <AdminSection title="Health">
        <p className="admin-empty" style={{ margin: 0 }}>
          Use tenant detail and audit for deeper investigation when failed events rise.
        </p>
      </AdminSection>
    </div>
  );
}

export default PlatformMonitoringPage;
