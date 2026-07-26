import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformSubscriptionsQuery } from '../settings/billingHooks';
import {
  AdminEmpty,
  AdminKpi,
  AdminListRow,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';

export function PlatformSubscriptionsPage() {
  usePageMeta({ title: 'Subscriptions — Platform Admin' });
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);
  const tenantsQuery = usePlatformTenantsQuery();

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Subscriptions"
        description="Platform-wide product subscription health. Open a tenant for plan, usage, and soft-lock detail."
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Total" value={subsQuery.data?.total_subscriptions ?? '…'} />
        {(subsQuery.data?.by_status ?? []).map((row) => (
          <AdminKpi
            key={row.status}
            label={row.status.replace('_', ' ')}
            value={row.count}
            tone={row.status.includes('active') ? 'good' : row.status.includes('trial') ? 'warn' : 'default'}
          />
        ))}
      </div>

      <div className="admin-split">
        <AdminSection title="By product">
          <div className="admin-list">
            {(subsQuery.data?.by_product ?? []).map((row) => (
              <AdminListRow
                key={row.product_code}
                title={row.product_code}
                trailing={<strong>{row.count}</strong>}
              />
            ))}
            {(subsQuery.data?.by_product ?? []).length === 0 ? (
              <AdminEmpty>No subscription breakdown yet.</AdminEmpty>
            ) : null}
          </div>
        </AdminSection>

        <AdminSection title="Tenants" description="Jump into billing entitlements and support actions.">
          <div className="admin-list">
            {(tenantsQuery.data ?? []).map((tenant) => (
              <AdminListRow
                key={tenant.id}
                href={`/admin/tenants/${tenant.id}`}
                title={tenant.display_name}
                meta={`${tenant.slug} · ${tenant.business_count} businesses`}
                trailing={<AdminStatus status={tenant.status} />}
              />
            ))}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformSubscriptionsPage;
