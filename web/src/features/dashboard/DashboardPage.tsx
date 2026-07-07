import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDashboardSettings, useBusinessLists, useBookingLists, useBusinessProfile, useSearchResults, deriveDashboardKpis } from './dashboardHooks';
import { DashboardWidget } from './DashboardWidget';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { quickActionItems, filterNavigationByProduct } from '../../config/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { GettingStartedChecklist } from '../onboarding/GettingStartedChecklist';
import { getProductName } from '../../config/products';

export function DashboardPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct),
    [activeProduct],
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
  const { customers, staff, services, notifications, availability } = useBusinessLists();
  const { todayBookings, rangeBookings, upcomingBookings, refresh } = useBookingLists(new Date().toISOString().slice(0, 10), {
    from: new Date().toISOString().slice(0, 10),
    to: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 6).toISOString().slice(0, 10),
  });
  const searchResults = useSearchResults(searchTerm);

  useEffect(() => {
    if (!settings.preferences.refreshInterval) return undefined;
    const intervalId = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }, settings.preferences.refreshInterval);
    return () => window.clearInterval(intervalId);
  }, [queryClient, settings.preferences.refreshInterval]);

  const tileColumns = settings.preferences.layout === 'compact' ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';

  const kpis = useMemo(() => {
    const bookings = todayBookings.data ?? [];
    const monthly = rangeBookings.data ?? [];
    const customerList = customers.data ?? [];
    const staffList = staff.data ?? [];
    const servicesList = services.data ?? [];
    const availabilityList = availability.data ?? [];
    return deriveDashboardKpis(bookings, monthly, customerList, staffList, servicesList, availabilityList);
  }, [todayBookings.data, rangeBookings.data, customers.data, staff.data, services.data, availability.data]);

  const businessName = business.data?.business_name ?? business.data?.display_name ?? 'Your business';
  const businessCurrency = business.data?.currency ?? workspace.activeBusiness?.currency;
  const formatAmount = (amount: number) => formatMoney(amount, businessCurrency);
  const staffOnDuty = staff.data?.filter((member) => member.status === 'active').length ?? 0;
  const unreadNotifications = notifications.data?.filter((notification) => !notification.is_read).length ?? 0;

  const schedule = todayBookings.data?.slice(0, 5) ?? [];
  const activity = [
    ...(todayBookings.data?.slice(0, 3).map((booking) => ({ id: booking.id, title: booking.booking_number ?? 'Booking', subtitle: booking.status ?? 'Status' })) ?? []),
    ...(customers.data?.slice(0, 2).map((customer) => ({ id: customer.id, title: customer.full_name ?? 'Customer', subtitle: customer.email ?? '' })) ?? []),
    ...(staff.data?.slice(0, 2).map((member) => ({ id: member.id, title: member.full_name ?? 'Staff', subtitle: member.status ?? '' })) ?? []),
  ];

  return (
    <div style={{ padding: 0, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div className="dashboard-shell" style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Workspace</p>
            <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1 }}>Welcome back, {businessName}</h1>
            <p style={{ margin: 0, color: theme.resolved === 'dark' ? '#d1d5db' : '#6b7280' }}>
              Your central workspace for bookings, customers, and day-to-day operations.
            </p>
          </div>
          <div className="dashboard-actions">
            {quickActions.map((action) => (
              <IconButton
                key={action.label}
                icon={<action.icon size={20} strokeWidth={2} />}
                label={action.label}
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
              style={{ width: '100%', borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#1f2937' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              aria-label="Search workspace"
            />
            <select
              value={settings.preferences.refreshInterval}
              onChange={(event) => settings.setRefreshInterval(Number(event.target.value))}
              style={{ borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
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
            <div className="dashboard-kpi-grid" style={{ marginBottom: 24 }}>
              {[
                { label: "Today's Bookings", value: kpis.todayCount },
                { label: 'Upcoming Bookings', value: upcomingBookings.data?.length ?? 0 },
                { label: 'Completed Today', value: kpis.todayCompleted },
                { label: 'Cancelled Today', value: kpis.todayCancelled },
                { label: 'Revenue Today', value: formatAmount(kpis.revenueToday) },
                { label: 'Revenue This Month', value: formatAmount(kpis.revenueMonth) },
                { label: 'Active Customers', value: kpis.activeCustomers },
                { label: 'New Customers', value: kpis.newCustomers },
                { label: 'Staff On Duty', value: kpis.staffOnDuty },
                { label: 'Occupancy Rate', value: `${kpis.occupancyRate}%` },
              ].map((item) => (
                <Card key={item.label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 120, padding: 20 }}>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{item.value}</p>
                </Card>
              ))}
            </div>

            <div className="dashboard-widget-grid" style={{ marginBottom: 24 }}>
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
                    <div key={booking.id} style={{ borderRadius: 12, padding: 14, background: theme.resolved === 'dark' ? '#111827' : '#f8fafc', display: 'grid', gap: 4 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{booking.booking_number ?? 'Booking #'}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{booking.status ?? 'Status unknown'}</p>
                    </div>
                  ))}
                </div>
              </DashboardWidget>

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
                    <div key={note.id} style={{ borderRadius: 12, padding: 14, background: note.is_read ? (theme.resolved === 'dark' ? '#0f172a' : '#f8fafc') : '#eff6ff' }}>
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
                    <div key={item.id} style={{ padding: 14, borderRadius: 12, background: theme.resolved === 'dark' ? '#111827' : '#f8fafc' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{item.title}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{item.subtitle}</p>
                    </div>
                  ))}
                </div>
              </DashboardWidget>

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

              <DashboardWidget title="Business Summary" loading={business.isLoading} error={business.error as Error | null} empty={!business.data && !business.isLoading}>
                {business.data ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{businessName}</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{business.data.status ?? 'Status unavailable'}</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>{staffOnDuty} staff active</p>
                    <p style={{ margin: 0, color: '#6b7280' }}>Working hours: 09:00 - 18:00</p>
                  </div>
                ) : null}
              </DashboardWidget>
            </div>
          </div>

          <aside className="dashboard-sidebar">
            {showWelcome ? (
              <GettingStartedChecklist
                onDismiss={() => setShowWelcome(false)}
              />
            ) : null}

            <Card>
              <p style={{ margin: 0, fontWeight: 700 }}>Workspace</p>
              <div style={{ marginTop: 12, display: 'grid', gap: 8, color: theme.resolved === 'dark' ? '#d1d5db' : '#6b7280', fontSize: 14 }}>
                <p style={{ margin: 0 }}><strong>Business:</strong> {businessName}</p>
                <p style={{ margin: 0 }}><strong>Status:</strong> {business.data?.status ?? workspace.activeBusiness?.status ?? 'Active'}</p>
                <p style={{ margin: 0 }}><strong>Product:</strong> {getProductName(workspace.activeProduct ?? business.data?.selected_product)}</p>
                <p style={{ margin: 0 }}><strong>Plan:</strong> Free Trial</p>
                <p style={{ margin: 0 }}><strong>Currency:</strong> {businessCurrency ?? '—'}</p>
              </div>
            </Card>
            <DashboardWidget title="Search results" subtitle={searchActive ? 'Type to search' : 'Preview results by term'} loading={searchResults.isLoading} error={searchResults.error as Error | null} empty={!searchResults.data?.bookings.length && !searchResults.data?.customers.length && !searchResults.data?.staff.length && !searchResults.data?.services.length && !searchResults.isLoading}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>Bookings</p>
                  {(searchResults.data?.bookings ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: theme.resolved === 'dark' ? '#0f172a' : '#f8fafc', marginTop: 6 }}>
                      <p style={{ margin: 0 }}>{item.booking_number ?? 'Booking'}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>Customers</p>
                  {(searchResults.data?.customers ?? []).slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: 10, borderRadius: 12, background: theme.resolved === 'dark' ? '#0f172a' : '#f8fafc', marginTop: 6 }}>
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
                    style={{ width: '100%', borderRadius: 10, border: '1px solid #e5e7eb', padding: '12px 14px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
                  >
                    <option value="grid">Grid</option>
                    <option value="compact">Compact</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#6b7280' }}>Refresh interval</span>
                  <span style={{ fontWeight: 700 }}>{settings.preferences.refreshInterval === 0 ? 'Manual' : `${settings.preferences.refreshInterval / 1000}s`}</span>
                </div>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  );
}
