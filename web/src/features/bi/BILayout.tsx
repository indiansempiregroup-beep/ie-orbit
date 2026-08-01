import { useMemo } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getSubscribedProductIds } from '../../config/products';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';

const biNav = [
  { to: '/bi/overview', labelKey: 'bi.overview', feature: 'overview', appointieOnly: false },
  { to: '/bi/growth', labelKey: 'bi.growth', feature: 'growth', appointieOnly: true },
  { to: '/bi/revenue', labelKey: 'bi.revenue', feature: 'revenue', appointieOnly: true },
  { to: '/bi/forecast', labelKey: 'bi.forecast', feature: 'forecast', appointieOnly: true },
  { to: '/bi/reports', labelKey: 'bi.reports', feature: 'reports', appointieOnly: true },
] as const;

function featureFromPath(pathname: string) {
  const match = biNav.find((item) => pathname.startsWith(item.to));
  return match?.feature ?? 'overview';
}

export function BILayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const workspace = useWorkspace();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const hasAppointie = subscribedIds.includes('appointie') || subscribedIds.length === 0;
  const visibleNav = useMemo(
    () => biNav.filter((item) => !item.appointieOnly || hasAppointie),
    [hasAppointie],
  );
  const allowed = new Set(billingQuery.data?.bi_features ?? ['overview']);
  const currentFeature = featureFromPath(location.pathname);
  const currentItem = biNav.find((item) => item.feature === currentFeature);
  const productBlocked = Boolean(currentItem?.appointieOnly && !hasAppointie);
  const locked = productBlocked || !allowed.has(currentFeature);

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
        <nav style={{ display: 'grid', gap: 6 }}>
          {visibleNav.map((item) => {
            const itemLocked = !allowed.has(item.feature);
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
        {billingQuery.data && (billingQuery.data.bi_features?.length ?? 0) <= 1 ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
            Starter includes Overview only.{' '}
            <Link to="/settings" style={{ color: 'var(--primary)' }}>
              Upgrade to Pro
            </Link>
          </p>
        ) : null}
        {!hasAppointie ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
            Growth, Revenue, Forecast, and Reports are available with AppointIE.
          </p>
        ) : null}
      </aside>
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
          <h2 style={{ margin: 0 }}>{productBlocked ? 'AppointIE feature' : 'Pro feature'}</h2>
          <p style={{ margin: 0, color: 'var(--muted-foreground, #6b7280)' }}>
            {productBlocked
              ? 'This BI tab is available when AppointIE is subscribed. Overview covers ShopIE analytics.'
              : 'Your current plan includes BI Overview only. Upgrade to Pro for Growth, Revenue, Forecast, and Reports.'}
          </p>
          <Link to="/settings" style={{ color: 'var(--primary)', fontWeight: 600, width: 'fit-content' }}>
            {productBlocked ? 'Manage products' : 'Upgrade plan'}
          </Link>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}

export default BILayout;
