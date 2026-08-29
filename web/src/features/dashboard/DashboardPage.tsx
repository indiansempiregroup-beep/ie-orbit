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
import { quickActionItems, filterNavigationByProduct } from '../../config/navigation';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { GettingStartedChecklist } from '../onboarding/GettingStartedChecklist';
import { getProductName, getSubscribedProductIds } from '../../config/products';
import { useShopOrders } from '../shop/shopHooks';

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 120, padding: 20 }}>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{value}</p>
    </Card>
  );
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
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct, auth.user, workspace.activeBusiness?.product_subscriptions),
    [activeProduct, auth.user, workspace.activeBusiness?.product_subscriptions],
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
  const summaryQuery = useDashboardSummary();
  const summary = summaryQuery.data;
  const hasAppointie = Boolean(summary?.appointie) || (summary ? summary.products.includes('appointie') : subscribedIds.includes('appointie'));
  const hasShopie = Boolean(summary?.shopie) || (summary ? summary.products.includes('shopie') : subscribedIds.includes('shopie'));
  const hasPets = Boolean(summary?.pets) || Boolean(summary?.pets_pack_enabled);

  const { customers, staff, notifications, availability } = useBusinessLists();
  const { todayBookings, refresh } = useBookingLists(new Date().toISOString().slice(0, 10), {
    from: new Date().toISOString().slice(0, 10),
    to: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 6).toISOString().slice(0, 10),
  });
  const shopOrders = useShopOrders();
  const searchResults = useSearchResults(searchTerm);

  useEffect(() => {
    if (!settings.preferences.refreshInterval) return undefined;
    const intervalId = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }, settings.preferences.refreshInterval);
    return () => window.clearInterval(intervalId);
  }, [queryClient, settings.preferences.refreshInterval]);

  const businessName = business.data?.business_name ?? business.data?.display_name ?? 'Your business';
  const businessCurrency = summary?.currency ?? business.data?.currency ?? workspace.activeBusiness?.currency;
  const formatAmount = (amount: number) => formatMoney(amount, businessCurrency);
  const staffOnDuty = summary?.appointie?.staff_on_duty ?? staff.data?.filter((member) => member.status === 'active').length ?? 0;
  const unreadNotifications =
    summary?.appointie?.unread_notifications ?? notifications.data?.filter((notification) => !notification.is_read).length ?? 0;

  const schedule = todayBookings.data?.slice(0, 5) ?? [];
  const recentOrders = (shopOrders.data ?? []).slice(0, 5);
  const activity = [
    ...(hasAppointie
      ? todayBookings.data?.slice(0, 3).map((booking) => ({
          id: booking.id,
          title: booking.booking_number ?? 'Booking',
          subtitle: booking.status ?? 'Status',
        })) ?? []
      : []),
    ...(hasShopie
      ? recentOrders.slice(0, 3).map((order) => ({
          id: order.id,
          title: order.order_number ?? 'Order',
          subtitle: `${order.status ?? 'Status'} · ${formatAmount(Number(order.total ?? 0))}`,
        }))
      : []),
    ...(customers.data?.slice(0, 2).map((customer) => ({
      id: customer.id,
      title: customer.full_name ?? 'Customer',
      subtitle: customer.email ?? '',
    })) ?? []),
  ];

  const welcomeSubtitle = useMemo(() => {
    if (hasAppointie && hasShopie) {
      return 'Your central workspace for bookings, shop operations, and day-to-day work.';
    }
    if (hasShopie) {
      return 'Your central workspace for orders, inventory, and day-to-day shop operations.';
    }
    return 'Your central workspace for bookings, customers, and day-to-day operations.';
  }, [hasAppointie, hasShopie]);

  const planLabel = useMemo(() => {
    const subs = workspace.activeBusiness?.product_subscriptions ?? [];
    const active = subs.find((s) => subscribedIds.includes(s.product_code));
    if (!active) return '—';
    const status = active.status ?? 'trialing';
    if (status === 'trialing') return 'Trial';
    return status.replace(/_/g, ' ');
  }, [subscribedIds, workspace.activeBusiness?.product_subscriptions]);

  const appointieKpis = summary?.appointie
    ? [
        { label: "Today's Bookings", value: summary.appointie.today_bookings },
        { label: 'Upcoming (7 days)', value: summary.appointie.upcoming_7d },
        { label: 'Completed Today', value: summary.appointie.today_completed },
        { label: 'Cancelled Today', value: summary.appointie.today_cancelled },
        { label: 'Revenue Today', value: formatAmount(summary.appointie.estimated_revenue_today) },
        { label: 'Revenue This Month', value: formatAmount(summary.appointie.estimated_revenue_month) },
        { label: 'Active Customers', value: summary.appointie.active_customers },
        { label: 'New Customers', value: summary.appointie.new_customers_today },
        { label: 'Staff On Duty', value: summary.appointie.staff_on_duty },
      ]
    : [];

  const shopieKpis = summary?.shopie
    ? [
        { label: 'Orders Today', value: summary.shopie.orders_today },
        { label: 'Orders This Month', value: summary.shopie.orders_month },
        { label: 'GMV Today', value: formatAmount(summary.shopie.gmv_today) },
        { label: 'GMV This Month', value: formatAmount(summary.shopie.gmv_month) },
        { label: 'Open Orders', value: summary.shopie.open_orders },
        { label: 'Pending Returns', value: summary.shopie.pending_returns },
        { label: 'Delivery Fees (Month)', value: formatAmount(summary.shopie.delivery_fee_month) },
      ]
    : [];

  const petsKpis = summary?.pets
    ? [
        { label: 'Pets enrolled', value: summary.pets.total },
        { label: 'Birthdays (7 days)', value: summary.pets.birthdays_next_7d },
        { label: 'Birthdays (30 days)', value: summary.pets.birthdays_next_30d },
        { label: 'With photo', value: summary.pets.with_photo },
      ]
    : [];

  return (
    <div style={{ padding: 0, background: '#f5f7fb', color: '#111827' }}>
      <div className="dashboard-shell" style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Workspace</p>
            <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1 }}>Welcome back, {businessName}</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>{welcomeSubtitle}</p>
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
              placeholder="Search customers, bookings, staff, services"
              style={{ width: '100%', borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: '#fff', color: '#111827' }}
              aria-label="Search workspace"
            />
            <select
              value={settings.preferences.refreshInterval}
              onChange={(event) => settings.setRefreshInterval(Number(event.target.value))}
              style={{ borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: '#fff', color: '#111827' }}
              aria-label="Dashboard refresh interval"
            >
              {settings.refreshIntervalOptions.map((interval) => (
                <option key={interval} value={interval}>
                  {interval === 0 ? 'Manual refresh' : `Refresh every ${interval / 1000}s`}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="dashboard-main-grid">
          <div>
            {summaryQuery.isLoading && !summary ? (
              <Card style={{ marginBottom: 24, padding: 20 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>Loading dashboard metrics…</p>
              </Card>
            ) : null}

            {appointieKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title="Orbit Appoint" subtitle="Bookings and service operations" />
                <div className="dashboard-kpi-grid">
                  {appointieKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {shopieKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title="Orbit Mart" subtitle="Orders, returns, and delivery" />
                <div className="dashboard-kpi-grid">
                  {shopieKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {petsKpis.length ? (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading title="Pets pack" subtitle="Roster and upcoming birthdays" />
                <div className="dashboard-kpi-grid">
                  {petsKpis.map((item) => (
                    <KpiCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dashboard-widget-grid" style={{ marginBottom: 24 }}>
              {hasAppointie ? (
                <DashboardWidget
                  title="Today's Schedule"
                  subtitle="Appointments for the current day"
                  loading={schedule.length === 0 && todayBookings.isLoading}
                  error={todayBookings.error as Error | null}
                  empty={!schedule.length && !todayBookings.isLoading}
                  onRefresh={refresh}
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    {schedule.map((booking) => (
                      <div key={booking.id} style={{ borderRadius: 12, padding: 14, background: '#f8fafc', display: 'grid', gap: 4 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{booking.booking_number ?? 'Booking #'}</p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{booking.status ?? 'Status unknown'}</p>
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              ) : null}

              {hasShopie ? (
                <DashboardWidget
                  title="Recent Orders"
                  subtitle="Latest shop activity"
                  loading={!recentOrders.length && shopOrders.isLoading}
                  error={shopOrders.error as Error | null}
                  empty={!recentOrders.length && !shopOrders.isLoading}
                  onRefresh={() => shopOrders.refetch()}
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    {recentOrders.map((order) => (
                      <div key={order.id} style={{ borderRadius: 12, padding: 14, background: '#f8fafc', display: 'grid', gap: 4 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{order.order_number ?? 'Order'}</p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
                          {order.status ?? 'Status'} · {formatAmount(Number(order.total ?? 0))}
                        </p>
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => navigate('/shop/orders')} style={{ width: '100%' }}>
                      View all orders
                    </Button>
                  </div>
                </DashboardWidget>
              ) : null}

              <DashboardWidget
                title="Notification Center"
                subtitle={`${unreadNotifications} unread`}
                loading={notifications.isLoading}
                error={notifications.error as Error | null}
                empty={!notifications.data?.length && !notifications.isLoading}
                onRefresh={() => notifications.refetch()}
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  {notifications.data?.slice(0, 4).map((note) => (
                    <div key={note.id} style={{ borderRadius: 12, padding: 14, background: note.is_read ? '#f8fafc' : '#eff6ff' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{note.subject ?? 'Notification'}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{note.body ?? ''}</p>
                    </div>
                  ))}
                  <Button variant="ghost" onClick={() => navigate('/notifications')} style={{ width: '100%' }}>
                    View all notifications
                  </Button>
                </div>
              </DashboardWidget>
            </div>

            <div className="dashboard-summary-grid" style={{ marginBottom: 24 }}>
              <DashboardWidget title="Recent Activity" loading={false} error={null} empty={!activity.length}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activity.map((item) => (
                    <div key={item.id} style={{ padding: 14, borderRadius: 12, background: '#f8fafc' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{item.title}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{item.subtitle}</p>
                    </div>
                  ))}
                </div>
              </DashboardWidget>

              {hasAppointie ? (
                <DashboardWidget title="Calendar Preview" subtitle="Today & week" loading={availability.isLoading} error={availability.error as Error | null} empty={!availability.data?.length && !availability.isLoading}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>Today&apos;s available capacity</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{availability.data?.length ?? 0} slots</p>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(availability.data ?? []).slice(0, 4).map((slot, index) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{new Date().toISOString().slice(0, 10)}</span>
                          <span>{slot.capacity} capacity</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </DashboardWidget>
              ) : null}

              <DashboardWidget title="Business Summary" loading={business.isLoading} error={business.error as Error | null} empty={!business.data && !business.isLoading}>
                {business.data ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{businessName}</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{business.data.status ?? 'Status unavailable'}</p>
                    {hasAppointie ? <p style={{ margin: 0, color: '#6b7280' }}>{staffOnDuty} staff active</p> : null}
                    <p style={{ margin: 0, color: '#6b7280' }}>
                      Products:{' '}
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
              <p style={{ margin: 0, fontWeight: 700 }}>Workspace</p>
              <div style={{ marginTop: 12, display: 'grid', gap: 8, color: '#6b7280', fontSize: 14 }}>
                <p style={{ margin: 0 }}>
                  <strong>Business:</strong> {businessName}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Status:</strong> {business.data?.status ?? workspace.activeBusiness?.status ?? 'Active'}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Products:</strong>{' '}
                  {(summary?.products?.length ? summary.products : subscribedIds).map((id) => getProductName(id)).join(', ') ||
                    getProductName(workspace.activeProduct ?? business.data?.selected_product)}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Plan:</strong> {planLabel}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Currency:</strong> {businessCurrency ?? '—'}
                </p>
                {hasPets ? (
                  <p style={{ margin: 0 }}>
                    <strong>Pets pack:</strong> Enabled
                  </p>
                ) : null}
              </div>
            </Card>
            <DashboardWidget
              title="Search results"
              subtitle={searchActive ? 'Type to search' : 'Preview results by term'}
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
                  <p style={{ margin: 0, fontWeight: 700 }}>Bookings</p>
                  {(searchResults.data?.bookings ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', marginTop: 6 }}>
                      <p style={{ margin: 0 }}>{item.booking_number ?? 'Booking'}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>Customers</p>
                  {(searchResults.data?.customers ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', marginTop: 6 }}>
                      <p style={{ margin: 0 }}>{item.full_name ?? 'Customer'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </DashboardWidget>

            <Card>
              <p style={{ margin: 0, fontWeight: 700 }}>Dashboard settings</p>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ fontSize: 14, color: '#6b7280' }}>Layout</label>
                  <select
                    value={settings.preferences.layout}
                    onChange={(event) => settings.setLayout(event.target.value as 'grid' | 'compact')}
                    style={{ width: '100%', borderRadius: 10, border: '1px solid #e5e7eb', padding: '12px 14px', background: '#fff', color: '#111827' }}
                  >
                    <option value="grid">Grid</option>
                    <option value="compact">Compact</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#6b7280' }}>Refresh interval</span>
                  <span style={{ fontWeight: 700 }}>
                    {settings.preferences.refreshInterval === 0 ? 'Manual' : `${settings.preferences.refreshInterval / 1000}s`}
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
