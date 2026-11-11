import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useDashboardSettings,
  useBusinessLists,
  useBookingLists,
  useBusinessProfile,
  useSearchResults,
  useDashboardSummary,
} from './dashboardHooks';
import { DashboardWidget } from './DashboardWidget';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { StaffReportFilter } from '../../components/StaffReportFilter';
import { useAuth } from '../../hooks/useAuth';
import { useProductNavigation } from '../../hooks/useProductNavigation';
import { useRoleMenus } from '../../hooks/useRoleMenus';
import { useReportStaffFilter } from '../../hooks/useReportStaffFilter';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { GettingStartedChecklist } from '../onboarding/GettingStartedChecklist';
import { getProductName, getSubscribedProductIds } from '../../config/products';
import { useShopOrders } from '../shop/shopHooks';
import { useBIOverviewQuery } from '../bi/biHooks';
import { canAccessReports, isStaffOnly } from '../../utils/roles';
import type { BIInsight } from '@ie-orbit/sdk';

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 120, padding: 20 }}>
      <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 12 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 500, fontFamily: 'var(--serif)' }}>{value}</p>
    </Card>
  );
}

function localDateKey(timeZone?: string | null, plusDays = 0) {
  let today: string;
  try {
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    today = `${y}-${m}-${d}`;
  }
  if (!plusDays) return today;
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + plusDays)).toISOString().slice(0, 10);
}

function pickInsights(groups: Array<BIInsight[] | undefined>, limit = 4): BIInsight[] {
  const picked: BIInsight[] = [];
  const queues = groups.map((group) => [...(group ?? [])]);
  while (picked.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>{subtitle}</p> : null}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const { quickActions } = useProductNavigation();
  const { isEnabled } = useRoleMenus();
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      if (localStorage.getItem('ie:onboarding:welcome-dismissed') === 'true') return false;
      return true;
    } catch {
      return true;
    }
  });
  const settings = useDashboardSettings();
  const business = useBusinessProfile();
  const showReports = canAccessReports(auth.user);
  const showBi = showReports && isEnabled('bi');
  const { staffId, setStaffId, canFilter } = useReportStaffFilter();
  const staffFilterActive = Boolean(staffId);
  const overviewQuery = useBIOverviewQuery(undefined, undefined, showBi);
  const summaryQuery = useDashboardSummary();
  const summary = summaryQuery.data;
  const hasAppointie = Boolean(summary?.appointie) || (summary ? summary.products.includes('appointie') : subscribedIds.includes('appointie'));
  const hasShopie = Boolean(summary?.shopie) || (summary ? summary.products.includes('shopie') : subscribedIds.includes('shopie'));
  const hasPets = Boolean(summary?.pets) || Boolean(summary?.pets_pack_enabled);
  const bookingStaffOnly = Boolean(summary?.viewer?.booking_staff);
  const hideShopUntilKnown = isStaffOnly(auth.user) && !summary;
  const showShopOps = hasShopie && !bookingStaffOnly && !hideShopUntilKnown && !staffFilterActive;
  const showBookings = hasAppointie && (isEnabled('bookings') || isEnabled('calendar'));
  const showOrders = showShopOps && isEnabled('orders');
  const showBooks = showShopOps && isEnabled('books');
  const showPetsWidgets = hasPets && isEnabled('pets') && !staffFilterActive;
  const showCustomers = isEnabled('customers');
  const showStaffKpi = isEnabled('staff') && !staffFilterActive;
  const showReturns = showShopOps && isEnabled('returns');

  const { customers, staff, notifications, availability } = useBusinessLists(staffId);
  const todayKey = localDateKey(workspace.activeBusiness?.timezone);
  const weekKey = localDateKey(workspace.activeBusiness?.timezone, 6);
  const { todayBookings, refresh } = useBookingLists(todayKey, {
    from: todayKey,
    to: weekKey,
  }, staffId);
  const shopOrders = useShopOrders();
  const searchResults = useSearchResults(searchTerm);

  useEffect(() => {
    if (!settings.preferences.refreshInterval) return undefined;
    const intervalId = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }, settings.preferences.refreshInterval);
    return () => window.clearInterval(intervalId);
  }, [queryClient, settings.preferences.refreshInterval]);

  const businessName = business.data?.business_name ?? business.data?.display_name ?? t('dashboard.yourBusiness');
  const businessCurrency = summary?.currency ?? business.data?.currency ?? workspace.activeBusiness?.currency;
  const formatAmount = (amount: number) => formatMoney(amount, businessCurrency);
  const staffOnDuty = summary?.appointie?.staff_on_duty ?? staff.data?.filter((member) => member.status === 'active').length ?? 0;
  const unreadNotifications =
    summary?.appointie?.unread_notifications ?? notifications.data?.filter((notification) => !notification.is_read).length ?? 0;

  const schedule = todayBookings.data?.slice(0, 5) ?? [];
  const recentOrders = (shopOrders.data?.items ?? []).slice(0, 5);
  const activity = [
    ...(showBookings
      ? todayBookings.data?.slice(0, 3).map((booking) => ({
          id: booking.id,
          title: booking.booking_number ?? t('dashboard.bookingFallback'),
          subtitle: booking.status ?? t('common.status'),
        })) ?? []
      : []),
    ...(showOrders
      ? recentOrders.slice(0, 3).map((order) => ({
          id: order.id,
          title: order.order_number ?? t('dashboard.orderFallback'),
          subtitle: `${order.status ?? t('common.status')} · ${formatAmount(Number(order.total ?? 0))}`,
        }))
      : []),
    ...(showCustomers
      ? customers.data?.slice(0, 2).map((customer) => ({
          id: customer.id,
          title: customer.full_name ?? t('dashboard.customerFallback'),
          subtitle: customer.email ?? '',
        })) ?? []
      : []),
  ];

  const welcomeSubtitle = useMemo(() => {
    if (hasAppointie && hasShopie) {
      return t('dashboard.welcomeBoth');
    }
    if (hasShopie) {
      return t('dashboard.welcomeShop');
    }
    return t('dashboard.welcomeBookings');
  }, [hasAppointie, hasShopie, t]);

  const planLabel = useMemo(() => {
    const subs = workspace.activeBusiness?.product_subscriptions ?? [];
    const active = subs.find((s) => subscribedIds.includes(s.product_code));
    if (!active) return '—';
    const status = active.status ?? 'trialing';
    if (status === 'trialing') return t('dashboard.planTrial');
    return status.replace(/_/g, ' ');
  }, [subscribedIds, workspace.activeBusiness?.product_subscriptions, t]);

  const appointieKpis = summary?.appointie && showBookings
    ? [
        { label: t('dashboard.todayBookings'), value: summary.appointie.today_bookings },
        { label: t('dashboard.upcomingBookings'), value: summary.appointie.upcoming_7d },
        { label: t('dashboard.completedToday'), value: summary.appointie.today_completed },
        { label: t('dashboard.cancelledToday'), value: summary.appointie.today_cancelled },
        { label: t('dashboard.revenueToday'), value: formatAmount(summary.appointie.estimated_revenue_today) },
        { label: t('dashboard.revenueMonth'), value: formatAmount(summary.appointie.estimated_revenue_month) },
        ...(showCustomers && !staffFilterActive
          ? [
              { label: t('dashboard.activeCustomers'), value: summary.appointie.active_customers },
              { label: t('dashboard.newCustomers'), value: summary.appointie.new_customers_today },
            ]
          : []),
        ...(showStaffKpi ? [{ label: t('dashboard.staffOnDuty'), value: summary.appointie.staff_on_duty }] : []),
      ]
    : [];

  const shopieKpis = summary?.shopie && (showOrders || showBooks || (staffFilterActive && hasShopie && !bookingStaffOnly))
    ? [
        ...(showOrders || staffFilterActive
          ? [
              { label: t('dashboard.ordersToday'), value: summary.shopie.orders_today },
              { label: t('dashboard.ordersMonth'), value: summary.shopie.orders_month },
              { label: t('dashboard.openOrders'), value: summary.shopie.open_orders },
            ]
          : []),
        ...(showBooks || showBi || staffFilterActive
          ? [
              { label: t('dashboard.gmvToday'), value: formatAmount(summary.shopie.gmv_today) },
              { label: t('dashboard.gmvMonth'), value: formatAmount(summary.shopie.gmv_month) },
              { label: t('dashboard.deliveryFeesMonth'), value: formatAmount(summary.shopie.delivery_fee_month) },
            ]
          : []),
        ...(showReturns ? [{ label: t('dashboard.pendingReturns'), value: summary.shopie.pending_returns }] : []),
      ]
    : [];

  const homeInsights = showBi
    ? pickInsights([
        overviewQuery.data?.appointie?.insights ?? overviewQuery.data?.insights,
        overviewQuery.data?.shopie?.insights,
        overviewQuery.data?.pets?.insights,
      ])
    : [];

  const petsKpis = summary?.pets && showPetsWidgets
    ? [
        { label: t('dashboard.petsEnrolled'), value: summary.pets.total },
        { label: t('dashboard.birthdays7d'), value: summary.pets.birthdays_next_7d },
        { label: t('dashboard.birthdays30d'), value: summary.pets.birthdays_next_30d },
        { label: t('dashboard.withPhoto'), value: summary.pets.with_photo },
      ]
    : [];

  return (
    <div style={{ padding: 0, background: '#f5f7fb', color: '#111827' }}>
      <div className="dashboard-shell" style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>{t('common.workspace')}</p>
            <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1 }}>
              {t('dashboard.welcome')}, {auth.user?.full_name || auth.user?.first_name || businessName}
            </h1>
            <p style={{ margin: 0, color: '#6b7280' }}>{welcomeSubtitle}</p>
            {canFilter ? (
              <StaffReportFilter staffId={staffId} onChange={setStaffId} />
            ) : null}
          </div>
          <div className="dashboard-actions">
            {quickActions.map((action) => (
              <IconButton
                key={action.labelKey}
                icon={<action.icon size={20} strokeWidth={2} />}
                label={t(action.labelKey)}
                variant="ghost"
                style={{ minWidth: 56, minHeight: 56 }}
                onClick={() => navigate(action.to)}
              />
            ))}
          </div>
          <div className="dashboard-input-row">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onFocus={() => setSearchActive(true)}
              onBlur={() => setTimeout(() => setSearchActive(false), 200)}
              placeholder={t('dashboard.searchPlaceholder')}
              style={{ width: '100%', borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: '#fff', color: '#111827' }}
              aria-label={t('common.search')}
            />
            <select
              value={settings.preferences.refreshInterval}
              onChange={(event) => settings.setRefreshInterval(Number(event.target.value))}
              style={{ borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: '#fff', color: '#111827' }}
              aria-label={t('dashboard.refreshIntervalAria')}
            >
              {settings.refreshIntervalOptions.map((interval) => (
                <option key={interval} value={interval}>
                  {interval === 0 ? t('dashboard.manualRefresh') : t('dashboard.refreshEvery', { seconds: interval / 1000 })}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="dashboard-main-grid">
          <div>
            {summaryQuery.isLoading && !summary ? (
              <Card style={{ marginBottom: 24, padding: 20 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>{t('common.loading')}</p>
              </Card>
            ) : null}

            {showBi && homeInsights.length ? (
              <Card style={{ marginBottom: 24, padding: 20 }}>
                <SectionHeading title={t('dashboard.insights')} subtitle={t('dashboard.insightsSubtitle')} />
                <div style={{ display: 'grid', gap: 12 }}>
                  {homeInsights.map((insight) => (
                    <div key={`${insight.type}-${insight.title}`}>
                      <div style={{ fontWeight: 700 }}>{insight.title}</div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>{insight.detail}</div>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" onClick={() => navigate('/bi/overview')} style={{ marginTop: 12 }}>
                  {t('dashboard.openBi')}
                </Button>
              </Card>
            ) : null}

            {appointieKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title="Orbit Appoint" subtitle={t('dashboard.appointSubtitle')} />
                <div className="dashboard-kpi-grid">
                  {appointieKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {shopieKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title="Orbit Mart" subtitle={t('dashboard.martSubtitle')} />
                <div className="dashboard-kpi-grid">
                  {shopieKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {petsKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title={t('dashboard.petsPack')} subtitle={t('dashboard.petsPackSubtitle')} />
                <div className="dashboard-kpi-grid">
                  {petsKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dashboard-widget-grid" style={{ marginBottom: 24 }}>
              {showBookings ? (
                <DashboardWidget
                  title={t('dashboard.todaysSchedule')}
                  subtitle={t('dashboard.todaysScheduleSubtitle')}
                  loading={schedule.length === 0 && todayBookings.isLoading}
                  error={todayBookings.error as Error | null}
                  empty={!schedule.length && !todayBookings.isLoading}
                  onRefresh={refresh}
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    {schedule.map((booking) => (
                      <div key={booking.id} style={{ borderRadius: 12, padding: 14, background: '#f8fafc', display: 'grid', gap: 4 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{booking.booking_number ?? t('dashboard.bookingNumberFallback')}</p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{booking.status ?? t('dashboard.statusUnknown')}</p>
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              ) : null}

              {showOrders ? (
                <DashboardWidget
                  title={t('dashboard.recentOrders')}
                  subtitle={t('dashboard.recentOrdersSubtitle')}
                  loading={!recentOrders.length && shopOrders.isLoading}
                  error={shopOrders.error as Error | null}
                  empty={!recentOrders.length && !shopOrders.isLoading}
                  onRefresh={() => shopOrders.refetch()}
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    {recentOrders.map((order) => (
                      <div key={order.id} style={{ borderRadius: 12, padding: 14, background: '#f8fafc', display: 'grid', gap: 4 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{order.order_number ?? t('dashboard.orderFallback')}</p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
                          {order.status ?? t('common.status')} · {formatAmount(Number(order.total ?? 0))}
                        </p>
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => navigate('/shop/orders')} style={{ width: '100%' }}>
                      {t('dashboard.viewAll')}
                    </Button>
                  </div>
                </DashboardWidget>
              ) : null}

              <DashboardWidget
                title={t('dashboard.notificationCenter')}
                subtitle={t('dashboard.unreadCount', { count: unreadNotifications })}
                loading={notifications.isLoading}
                error={notifications.error as Error | null}
                empty={!notifications.data?.length && !notifications.isLoading}
                onRefresh={() => notifications.refetch()}
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  {notifications.data?.slice(0, 4).map((note) => (
                    <div key={note.id} style={{ borderRadius: 12, padding: 14, background: note.is_read ? '#f8fafc' : '#eff6ff' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{note.subject ?? t('dashboard.notificationFallback')}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{note.body ?? ''}</p>
                    </div>
                  ))}
                  <Button variant="ghost" onClick={() => navigate('/notifications')} style={{ width: '100%' }}>
                    {t('dashboard.viewAll')}
                  </Button>
                </div>
              </DashboardWidget>
            </div>

            <div className="dashboard-summary-grid" style={{ marginBottom: 24 }}>
              <DashboardWidget title={t('dashboard.recentActivity')} loading={false} error={null} empty={!activity.length}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activity.map((item) => (
                    <div key={item.id} style={{ padding: 14, borderRadius: 12, background: '#f8fafc' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{item.title}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{item.subtitle}</p>
                    </div>
                  ))}
                </div>
              </DashboardWidget>

              {showBookings && isEnabled('calendar') ? (
                <DashboardWidget title={t('dashboard.calendarPreview')} subtitle={t('dashboard.calendarPreviewSubtitle')} loading={availability.isLoading} error={availability.error as Error | null} empty={!availability.data?.length && !availability.isLoading}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{t('dashboard.availableCapacity')}</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{t('dashboard.slotsCount', { count: availability.data?.length ?? 0 })}</p>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(availability.data ?? []).slice(0, 4).map((slot, index) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{todayKey}</span>
                          <span>{t('dashboard.capacityCount', { count: slot.capacity })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </DashboardWidget>
              ) : null}

              <DashboardWidget title={t('dashboard.businessSummary')} loading={business.isLoading} error={business.error as Error | null} empty={!business.data && !business.isLoading}>
                {business.data ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{businessName}</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{business.data.status ?? t('dashboard.statusUnavailable')}</p>
                    {showStaffKpi && hasAppointie ? <p style={{ margin: 0, color: '#6b7280' }}>{t('dashboard.staffActiveCount', { count: staffOnDuty })}</p> : null}
                    <p style={{ margin: 0, color: '#6b7280' }}>
                      {t('common.products')}:{' '}
                      {(summary?.products?.length ? summary.products : subscribedIds).map((id) => getProductName(id)).join(', ') || '—'}
                    </p>
                  </div>
                ) : null}
              </DashboardWidget>
            </div>
          </div>

          <aside className="dashboard-sidebar">
            {showWelcome ? <GettingStartedChecklist onDismiss={() => setShowWelcome(false)} /> : null}

            <Card>
              <p style={{ margin: 0, fontWeight: 700 }}>{t('common.workspace')}</p>
              <div style={{ marginTop: 12, display: 'grid', gap: 8, color: '#6b7280', fontSize: 14 }}>
                <p style={{ margin: 0 }}>
                  <strong>{t('common.business')}:</strong> {businessName}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{t('common.status')}:</strong>{' '}
                  {business.data?.status ?? workspace.activeBusiness?.status ?? t('common.active')}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{t('common.products')}:</strong>{' '}
                  {(summary?.products?.length ? summary.products : subscribedIds).map((id) => getProductName(id)).join(', ') ||
                    getProductName(workspace.activeProduct ?? business.data?.selected_product)}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{t('dashboard.planLabel')}:</strong> {planLabel}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{t('common.currency')}:</strong> {businessCurrency ?? '—'}
                </p>
                {hasPets ? (
                  <p style={{ margin: 0 }}>
                    <strong>{t('dashboard.petsPack')}:</strong> {t('dashboard.enabled')}
                  </p>
                ) : null}
              </div>
            </Card>
            <DashboardWidget
              title={t('dashboard.searchResults')}
              subtitle={searchActive ? t('dashboard.typeToSearch') : t('dashboard.previewByTerm')}
              loading={searchResults.isLoading}
              error={searchResults.error as Error | null}
              empty={
                !searchResults.data?.bookings.length &&
                !searchResults.data?.customers.length &&
                !searchResults.data?.staff.length &&
                !searchResults.data?.services.length &&
                !searchResults.isLoading
              }
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{t('dashboard.bookingsHeading')}</p>
                  {(searchResults.data?.bookings ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', marginTop: 6 }}>
                      <p style={{ margin: 0 }}>{item.booking_number ?? t('dashboard.bookingFallback')}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{t('dashboard.customersHeading')}</p>
                  {(searchResults.data?.customers ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', marginTop: 6 }}>
                      <p style={{ margin: 0 }}>{item.full_name ?? t('dashboard.customerFallback')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </DashboardWidget>

            <Card>
              <p style={{ margin: 0, fontWeight: 700 }}>{t('dashboard.settingsTitle')}</p>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ fontSize: 14, color: '#6b7280' }}>{t('dashboard.layout')}</label>
                  <select
                    value={settings.preferences.layout}
                    onChange={(event) => settings.setLayout(event.target.value as 'grid' | 'compact')}
                    style={{ width: '100%', borderRadius: 10, border: '1px solid #e5e7eb', padding: '12px 14px', background: '#fff', color: '#111827' }}
                  >
                    <option value="grid">{t('dashboard.layoutGrid')}</option>
                    <option value="compact">{t('dashboard.layoutCompact')}</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#6b7280' }}>{t('dashboard.refreshInterval')}</span>
                  <span style={{ fontWeight: 700 }}>
                    {settings.preferences.refreshInterval === 0
                      ? t('dashboard.refreshIntervalManual')
                      : t('dashboard.intervalSeconds', { seconds: settings.preferences.refreshInterval / 1000 })}
                  </span>
                </div>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  );
}
