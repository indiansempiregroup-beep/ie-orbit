import { Link } from 'react-router-dom';
import { formatTimestamp } from '../../lib/datetime';
import {
  useBillingPlatformAuditFeedQuery,
  useBillingPlatformMonitoringQuery,
  useBillingPlatformOpsSummaryQuery,
  useBillingPlatformSubscriptionsQuery,
} from '../settings/billingHooks';
import { AdminEmpty, AdminKpi, AdminListRow, AdminPageHeader, AdminSection, AdminStatus } from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';

export function PlatformDashboardPage() {
  const tenantsQuery = usePlatformTenantsQuery();
  const opsQuery = useBillingPlatformOpsSummaryQuery(24, 100, true);
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, true);
  const auditFeedQuery = useBillingPlatformAuditFeedQuery(10, true);

  const tenantCount = tenantsQuery.isLoading ? '…' : (tenantsQuery.data?.length ?? 0);
  const failed = monitoringQuery.data?.failed_events ?? 0;

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Command center"
        description="Cross-tenant readiness, subscriptions, and operational health at a glance."
        actions={
          <>
            <Link className="admin-btn admin-btn--secondary" to="/admin/tenants">
              Browse tenants
            </Link>
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Tenants" value={tenantCount} hint="All workspaces" />
        <AdminKpi
          label="Ready"
          value={opsQuery.data?.ready_count ?? '…'}
          hint="Go-live ready"
          tone="good"
        />
        <AdminKpi
          label="Subscriptions"
          value={subsQuery.data?.total_subscriptions ?? '…'}
          hint="Active catalog"
        />
        <AdminKpi
          label="Failed events"
          value={failed}
          hint="Last 24 hours"
          tone={failed > 0 ? 'danger' : 'good'}
        />
      </div>

      <div className="admin-split">
        <AdminSection
          title="Recent tenants"
          description="Jump into a workspace for billing or support actions."
          actions={
            <Link className="admin-btn admin-btn--ghost" to="/admin/tenants">
              View all
            </Link>
          }
        >
          <div className="admin-list">
            {(tenantsQuery.data ?? []).slice(0, 6).map((tenant) => (
              <AdminListRow
                key={tenant.id}
                href={`/admin/tenants/${tenant.id}`}
                title={tenant.display_name}
                meta={`${tenant.slug} · ${tenant.business_count} business(es)`}
                trailing={<AdminStatus status={tenant.status} />}
              />
            ))}
            {!tenantsQuery.isLoading && (tenantsQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No tenants yet.</AdminEmpty>
            ) : null}
          </div>
        </AdminSection>

        <AdminSection title="Live audit pulse" description="Latest billing and ops signals.">
          <div className="admin-list">
            {(auditFeedQuery.data?.rows ?? []).slice(0, 6).map((row) => (
              <AdminListRow
                key={row.id}
                title={row.action}
                meta={`Tenant ${row.tenant_id} · ${formatTimestamp(row.created_at)}`}
              />
            ))}
            {!auditFeedQuery.data?.rows?.length ? <AdminEmpty>No recent audit rows.</AdminEmpty> : null}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformDashboardPage;
