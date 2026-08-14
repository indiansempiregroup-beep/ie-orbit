import { Link } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Building2,
  CreditCard,
  Inbox,
  Package,
  RefreshCw,
  ShieldCheck,
  TicketPercent,
  TriangleAlert,
} from 'lucide-react';
import { formatTimestamp } from '../../lib/datetime';
import {
  useBillingPlatformAuditFeedQuery,
  useBillingPlatformMonitoringQuery,
  useBillingPlatformOpsSummaryQuery,
  useBillingPlatformRevenueQuery,
  useBillingPlatformSubscriptionsQuery,
} from '../settings/billingHooks';
import {
  AdminEmpty,
  AdminKpi,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  humanizeAction,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';

function formatInr(paise?: number | null) {
  return `₹${Math.round((paise ?? 0) / 100).toLocaleString('en-IN')}`;
}

export function PlatformDashboardPage() {
  const tenantsQuery = usePlatformTenantsQuery();
  const opsQuery = useBillingPlatformOpsSummaryQuery(24, 100, true);
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);
  const revenueQuery = useBillingPlatformRevenueQuery(true);
  const monitoringQuery = useBillingPlatformMonitoringQuery(24, true);
  const auditFeedQuery = useBillingPlatformAuditFeedQuery(10, true);

  const tenantCount = tenantsQuery.isLoading ? '…' : (tenantsQuery.data?.length ?? 0);
  const failed = monitoringQuery.data?.failed_events ?? 0;
  const notReady = (opsQuery.data?.rows ?? []).filter((row) => !row.ready).slice(0, 6);
  const revenue = revenueQuery.data;
  const maxDaily = Math.max(1, ...(revenue?.daily ?? []).map((row) => row.collected_paise));
  const refreshing =
    tenantsQuery.isFetching ||
    opsQuery.isFetching ||
    subsQuery.isFetching ||
    revenueQuery.isFetching ||
    monitoringQuery.isFetching ||
    auditFeedQuery.isFetching;

  async function refresh() {
    await Promise.all([
      tenantsQuery.refetch(),
      opsQuery.refetch(),
      subsQuery.refetch(),
      revenueQuery.refetch(),
      monitoringQuery.refetch(),
      auditFeedQuery.refetch(),
    ]);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Dashboard"
        description="Collections, recurring revenue, workspace readiness, and the latest platform activity."
        actions={
          <>
            <Link className="admin-btn admin-btn--secondary" to="/admin/tenants">
              Browse tenants
            </Link>
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Collected this month"
          value={revenueQuery.isLoading ? '…' : formatInr(revenue?.collected_month_paise)}
          hint={`Net all-time ${formatInr(revenue?.net_collected_paise)}`}
          tone="good"
          icon={<Banknote size={16} />}
        />
        <AdminKpi
          label="MRR"
          value={revenueQuery.isLoading ? '…' : formatInr(revenue?.mrr_paise)}
          hint={`${revenue?.paying_subscriptions ?? 0} paying · ARR ${formatInr(revenue?.arr_paise)}`}
          icon={<CreditCard size={16} />}
        />
        <AdminKpi
          label="Pending claims"
          value={revenueQuery.isLoading ? '…' : formatInr(revenue?.pending_claims_paise)}
          hint={`${revenue?.pending_claims_count ?? 0} awaiting · confirm in Claims`}
          tone={(revenue?.pending_claims_count ?? 0) > 0 ? 'warn' : 'default'}
        />
        <AdminKpi
          label="Failed events"
          value={failed}
          hint="Last 24 hours"
          tone={failed > 0 ? 'danger' : 'good'}
          icon={<TriangleAlert size={16} />}
        />
      </div>

      <div className="admin-kpi-grid">
        <AdminKpi label="Tenants" value={tenantCount} hint="All workspaces" icon={<Building2 size={16} />} />
        <AdminKpi
          label="Ready"
          value={opsQuery.data?.ready_count ?? '…'}
          hint={`${opsQuery.data?.not_ready_count ?? 0} need attention`}
          tone="good"
          icon={<ShieldCheck size={16} />}
        />
        <AdminKpi
          label="Subscriptions"
          value={subsQuery.data?.total_subscriptions ?? '…'}
          hint={`${revenue?.trial_subscriptions ?? 0} trial · ${revenue?.complimentary_subscriptions ?? 0} complimentary`}
          icon={<CreditCard size={16} />}
        />
      </div>

      <AdminSection
        title="Collections · last 14 days"
        description="Confirmed checkout totals. Open the Revenue page for product mix, top tenants, and recent payments."
        actions={
          <Link className="admin-btn admin-btn--ghost" to="/admin/revenue">
            Open revenue
          </Link>
        }
      >
        {(revenue?.daily ?? []).every((row) => row.collected_paise === 0) ? (
          <AdminEmpty title="No collections yet">
            Paid checkouts will show here after the first confirmed UPI or Razorpay payment.
          </AdminEmpty>
        ) : (
          <div className="admin-spark" aria-label="Daily collections">
            {(revenue?.daily ?? []).map((row) => (
              <div key={row.day} className="admin-spark__col" title={`${row.day}: ${formatInr(row.collected_paise)}`}>
                <span
                  className="admin-spark__bar"
                  style={{ height: `${Math.max(6, (row.collected_paise / maxDaily) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <div className="admin-shortcut-grid">
        <Link className="admin-shortcut" to="/admin/revenue">
          <span className="admin-shortcut__icon">
            <Banknote size={16} />
          </span>
          <strong>Revenue</strong>
          <span>Collections, MRR, and top tenants</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/claims">
          <span className="admin-shortcut__icon">
            <Inbox size={16} />
          </span>
          <strong>Claims</strong>
          <span>Confirm pending UPI payments</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/tenants">
          <span className="admin-shortcut__icon">
            <Building2 size={16} />
          </span>
          <strong>Tenants</strong>
          <span>Provision and inspect workspaces</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/subscriptions">
          <span className="admin-shortcut__icon">
            <CreditCard size={16} />
          </span>
          <strong>Subscriptions</strong>
          <span>Product mix and billing status</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/packages">
          <span className="admin-shortcut__icon">
            <Package size={16} />
          </span>
          <strong>Packages</strong>
          <span>Plans, pricing, and entitlements</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/coupons">
          <span className="admin-shortcut__icon">
            <TicketPercent size={16} />
          </span>
          <strong>Coupons</strong>
          <span>Checkout discount codes</span>
        </Link>
        <Link className="admin-shortcut" to="/admin/monitoring">
          <span className="admin-shortcut__icon">
            <Activity size={16} />
          </span>
          <strong>Monitoring</strong>
          <span>Failed events and ops health</span>
        </Link>
      </div>

      <div className="admin-split">
        <AdminSection
          title="Recent tenants"
          description="Jump into a workspace for billing or support."
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
                title={
                  <>
                    <span className="admin-swatch" style={{ background: tenant.primary_color || '#2563eb' }} />
                    {tenant.display_name}
                  </>
                }
                meta={`${tenant.slug} · ${tenant.business_count} business${tenant.business_count === 1 ? '' : 'es'}`}
                trailing={<AdminStatus status={tenant.status} />}
              />
            ))}
            {!tenantsQuery.isLoading && (tenantsQuery.data ?? []).length === 0 ? (
              <AdminEmpty title="No tenants yet">Create the first workspace from the Tenants page.</AdminEmpty>
            ) : null}
          </div>
        </AdminSection>

        <AdminSection
          title={notReady.length ? 'Needs attention' : 'Live audit pulse'}
          description={notReady.length ? 'Workspaces that are not go-live ready.' : 'Latest billing and ops signals.'}
          actions={
            <Link className="admin-btn admin-btn--ghost" to={notReady.length ? '/admin/monitoring' : '/admin/audit'}>
              Open feed
            </Link>
          }
        >
          <div className="admin-list">
            {notReady.length
              ? notReady.map((row) => (
                  <AdminListRow
                    key={row.tenant_id || row.tenant_slug}
                    href={row.tenant_id ? `/admin/tenants/${row.tenant_id}` : undefined}
                    title={row.tenant_name || row.tenant_slug || 'Tenant'}
                    meta={(row.blockers ?? []).slice(0, 2).join(' · ') || 'Not ready'}
                    trailing={<AdminStatus status="pending" />}
                  />
                ))
              : (auditFeedQuery.data?.rows ?? []).slice(0, 6).map((row) => (
                  <AdminListRow
                    key={row.id}
                    href={row.tenant_id ? `/admin/tenants/${row.tenant_id}` : undefined}
                    title={humanizeAction(row.action)}
                    meta={`${row.resource_type || 'event'} · ${formatTimestamp(row.created_at)}`}
                  />
                ))}
            {!notReady.length && !auditFeedQuery.data?.rows?.length ? (
              <AdminEmpty>No recent audit rows.</AdminEmpty>
            ) : null}
          </div>
        </AdminSection>
      </div>
    </AdminPage>
  );
}

export default PlatformDashboardPage;
