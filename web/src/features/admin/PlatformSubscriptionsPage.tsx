import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformSubscriptionsQuery } from '../settings/billingHooks';
import {
  AdminEmpty,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  AdminTable,
  productLabel,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';

export function PlatformSubscriptionsPage() {
  usePageMeta({ title: 'Subscriptions — Platform Admin' });
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);
  const tenantsQuery = usePlatformTenantsQuery();

  const total = subsQuery.data?.total_subscriptions ?? 0;
  const byStatus = subsQuery.data?.by_status ?? [];
  const byProduct = subsQuery.data?.by_product ?? [];
  const maxProduct = Math.max(1, ...byProduct.map((row) => row.count));
  const maxStatus = Math.max(1, ...byStatus.map((row) => row.count));
  const recentTenants = (tenantsQuery.data ?? []).slice(0, 8);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Subscriptions"
        description="Platform-wide product mix and billing status. Open a tenant to change plans or inspect entitlements."
        actions={
          <Link className="admin-btn admin-btn--secondary" to="/admin/packages">
            Manage packages
          </Link>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Total subscriptions"
          value={subsQuery.isLoading ? '…' : total}
          hint="All products"
          icon={<CreditCard size={16} />}
        />
        {byStatus.slice(0, 3).map((row) => (
          <AdminKpi
            key={row.status}
            label={row.status.replace(/_/g, ' ')}
            value={row.count}
            tone={row.status.includes('active') ? 'good' : row.status.includes('trial') ? 'warn' : 'default'}
          />
        ))}
      </div>

      <div className="admin-split">
        <AdminSection title="By product" description="Share of billed product subscriptions.">
          {byProduct.length === 0 ? (
            <AdminEmpty>No subscription breakdown yet.</AdminEmpty>
          ) : (
            <div className="admin-mix">
              {byProduct.map((row) => (
                <div key={row.product_code} className="admin-mix-row">
                  <div className="admin-mix-row__head">
                    <strong>{productLabel(row.product_code)}</strong>
                    <span>
                      {row.count} · {Math.round((row.count / Math.max(total, 1)) * 100)}%
                    </span>
                  </div>
                  <div className="admin-mix-bar">
                    <i style={{ width: `${Math.max(6, (row.count / maxProduct) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSection>

        <AdminSection title="By status" description="Lifecycle of current subscriptions.">
          {byStatus.length === 0 ? (
            <AdminEmpty>No status breakdown yet.</AdminEmpty>
          ) : (
            <div className="admin-mix">
              {byStatus.map((row) => (
                <div key={row.status} className="admin-mix-row">
                  <div className="admin-mix-row__head">
                    <AdminStatus status={row.status} />
                    <span>{row.count}</span>
                  </div>
                  <div className="admin-mix-bar">
                    <i style={{ width: `${Math.max(6, (row.count / maxStatus) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSection>
      </div>

      <AdminSection
        title="Open a tenant"
        description="Plan changes, usage, and soft-locks live on the tenant detail page."
        actions={
          <Link className="admin-btn admin-btn--ghost" to="/admin/tenants">
            All tenants
          </Link>
        }
      >
        {recentTenants.length === 0 ? (
          <AdminEmpty>No tenants to inspect yet.</AdminEmpty>
        ) : (
          <AdminTable columns={['Workspace', 'Slug', 'Businesses', 'Status']}>
            {recentTenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <Link to={`/admin/tenants/${tenant.id}`}>
                    <span className="admin-swatch" style={{ background: tenant.primary_color || '#2563eb' }} />
                    {tenant.display_name}
                  </Link>
                </td>
                <td className="admin-table__muted">{tenant.slug}</td>
                <td>{tenant.business_count}</td>
                <td>
                  <AdminStatus status={tenant.status} />
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminSection>
    </AdminPage>
  );
}

export default PlatformSubscriptionsPage;
