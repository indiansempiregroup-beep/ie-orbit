import { useMemo } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getSubscribedProductIds } from '../../config/products';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';

const biNav = [
  { to: '/bi/overview', labelKey: 'bi.overview', feature: 'overview', appointieOnly: false, shopieOnly: false },
  { to: '/bi/profit', labelKey: 'bi.profit', feature: 'profit', appointieOnly: false, shopieOnly: true },
  { to: '/bi/growth', labelKey: 'bi.growth', feature: 'growth', appointieOnly: true, shopieOnly: false },
  { to: '/bi/revenue', labelKey: 'bi.revenue', feature: 'revenue', appointieOnly: true, shopieOnly: false },
  { to: '/bi/forecast', labelKey: 'bi.forecast', feature: 'forecast', appointieOnly: true, shopieOnly: false },
  { to: '/bi/reports', labelKey: 'bi.reports', feature: 'reports', appointieOnly: true, shopieOnly: false },
] as const;

function featureFromPath(pathname: string) {
  const match = biNav.find((item) => pathname.startsWith(item.to));
  return match?.feature ?? 'overview';
}

function featureAllowed(allowed: Set<string>, feature: string) {
  if (allowed.has(feature)) return true;
  // Existing Starter packages only list overview; Profit is Mart analytics at Overview access.
  if (feature === 'profit' && allowed.has('overview')) return true;
  return false;
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
  const hasShopie = subscribedIds.includes('shopie');
  const visibleNav = useMemo(
    () =>
      biNav.filter((item) => {
        if (item.shopieOnly && !hasShopie) return false;
        if (item.appointieOnly && !hasAppointie) return false;
        return true;
      }),
    [hasAppointie, hasShopie],
  );
  const allowed = new Set(billingQuery.data?.bi_features ?? ['overview', 'profit']);
  const currentFeature = featureFromPath(location.pathname);
  const currentItem = biNav.find((item) => item.feature === currentFeature);
  const productBlocked = Boolean(
    (currentItem?.appointieOnly && !hasAppointie) || (currentItem?.shopieOnly && !hasShopie),
  );
  const locked = productBlocked || !featureAllowed(allowed, currentFeature);

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
        {billingQuery.data && (billingQuery.data.bi_features?.length ?? 0) <= 1 ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
            Starter includes Overview and Profit.{' '}
            <Link to="/settings" style={{ color: 'var(--primary)' }}>
              Upgrade to Pro
            </Link>
          </p>
        ) : null}
        {!hasAppointie ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
            Growth, Revenue, Forecast, and Reports are available with Orbit Appoint.
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
          <h2 style={{ margin: 0 }}>
            {productBlocked
              ? currentItem?.shopieOnly
                ? 'Orbit Mart feature'
                : 'Orbit Appoint feature'
              : 'Pro feature'}
          </h2>
          <p style={{ margin: 0, color: 'var(--muted-foreground, #6b7280)' }}>
            {productBlocked
              ? currentItem?.shopieOnly
                ? 'Profit insights are available when Orbit Mart is subscribed.'
                : 'This BI tab is available when Orbit Appoint is subscribed. Overview covers Orbit Mart analytics.'
              : 'Your current plan includes BI Overview and Profit. Upgrade to Pro for Growth, Revenue, Forecast, and Reports.'}
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
