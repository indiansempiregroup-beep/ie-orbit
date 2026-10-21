import { useMemo } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StaffReportFilter } from '../../components/StaffReportFilter';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useReportStaffFilter } from '../../hooks/useReportStaffFilter';
import { getSubscribedProductIds } from '../../config/products';
import { useStaffList } from '../management/managementHooks';
import { productsWithBiFeature } from '../../config/planFeatures';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';

const biNav = [
  { to: '/bi/overview', labelKey: 'bi.overview', feature: 'overview' },
  { to: '/bi/profit', labelKey: 'bi.profit', feature: 'profit' },
  { to: '/bi/growth', labelKey: 'bi.growth', feature: 'growth' },
  { to: '/bi/revenue', labelKey: 'bi.revenue', feature: 'revenue' },
  { to: '/bi/forecast', labelKey: 'bi.forecast', feature: 'forecast' },
  { to: '/bi/reports', labelKey: 'bi.reports', feature: 'reports' },
] as const;

function featureFromPath(pathname: string) {
  const match = biNav.find((item) => pathname.startsWith(item.to));
  return match?.feature ?? 'overview';
}

function featureAllowed(allowed: Set<string>, feature: string) {
  return allowed.has(feature);
}

export function BILayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const workspace = useWorkspace();
  const { staffId, setStaffId, canFilter } = useReportStaffFilter();
  const staffQuery = useStaffList();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const allowed = useMemo(
    () =>
      new Set(
        biNav
          .map((item) => item.feature)
          .filter((feature) => productsWithBiFeature(billingQuery.data, feature, subscribedIds).length > 0),
      ),
    [billingQuery.data, subscribedIds],
  );
  const visibleNav = useMemo(
    () => biNav.filter((item) => allowed.has(item.feature)),
    [allowed],
  );
  const currentFeature = featureFromPath(location.pathname);
  const locked = !featureAllowed(allowed, currentFeature);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
      <aside
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          position: 'sticky',
          top: 16,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 10 }}>{t('bi.title')}</strong>
        {canFilter ? (
          <div style={{ marginBottom: 12 }}>
            <StaffReportFilter staff={staffQuery.data ?? []} staffId={staffId} onChange={setStaffId} />
          </div>
        ) : null}
        <nav style={{ display: 'grid', gap: 6 }}>
          {visibleNav.map((item) => {
            const itemLocked = !featureAllowed(allowed, item.feature);
            if (itemLocked) {
              return (
                <div
                  key={item.to}
                  title="Upgrade to Pro to unlock"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    color: 'var(--muted-foreground, #6b7280)',
                    opacity: 0.65,
                    fontWeight: 500,
                  }}
                >
                  {t(item.labelKey)} · {t('bi.pro')}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  padding: '8px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: isActive ? 'var(--primary)' : 'var(--foreground)',
                  background: isActive ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  fontWeight: isActive ? 600 : 500,
                })}
              >
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </nav>
        {billingQuery.data && !allowed.has('growth') && !allowed.has('reports') ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
            Your current plan includes a limited BI set.{' '}
            <Link to="/settings" style={{ color: 'var(--primary)' }}>
              Upgrade to Pro
            </Link>
          </p>
        ) : null}
      </aside>
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        {locked ? (
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              display: 'grid',
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0 }}>Not on this plan</h2>
            <p style={{ margin: 0, color: 'var(--muted-foreground, #6b7280)' }}>
              This BI tab is not included in your current plan for the subscribed products.
            </p>
            <Link to="/settings" style={{ color: 'var(--primary)', fontWeight: 600, width: 'fit-content' }}>
              Manage plan
            </Link>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}

export default BILayout;
