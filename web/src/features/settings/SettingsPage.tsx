import React, { useMemo } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { useBusinessProfile } from '../dashboard/dashboardHooks';
import { useProfileDetails } from '../profile/profileHooks';

export function SettingsPage() {
  const theme = useTheme();
  const business = useBusinessProfile();
  const profile = useProfileDetails();

  const businessData = business.data;
  const user = profile.user;

  const settingsSummary = useMemo(
    () => [
      { label: 'Business Status', value: businessData?.status ?? 'Unavailable' },
      { label: 'Currency', value: businessData?.currency ?? 'USD' },
      { label: 'Timezone', value: businessData?.timezone ?? 'UTC' },
      { label: 'Notification preferences', value: user?.notification_preferences ? 'Configured' : 'Not configured' },
    ],
    [businessData, user?.notification_preferences],
  );

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Business Settings</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Settings</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Review business preferences, account policies, and system configuration details.</p>
          </div>
          <Button variant="neutral" onClick={() => business.refetch()}>Refresh</Button>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Business profile</h2>
            <p style={{ color: '#6b7280', margin: '12px 0 0' }}>{businessData?.business_name ?? businessData?.display_name ?? 'Business information is unavailable.'}</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>ID</span>
                <strong>{businessData?.id ?? '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Status</span>
                <strong>{businessData?.status ?? '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Region</span>
                <strong>{businessData?.timezone ?? '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Currency</span>
                <strong>{businessData?.currency ?? '—'}</strong>
              </div>
            </div>
          </Card>

          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Account preferences</h2>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Name</span>
                <strong>{user?.full_name ?? '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Email</span>
                <strong>{user?.email ?? '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Notifications</span>
                <strong>{user?.notification_preferences ? 'Enabled' : 'Default'}</strong>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <Button variant="ghost">Edit preference settings</Button>
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Role management</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Configure roles and permissions for your team members. Role assignment and granular permission policies are essential to secure business operations.</p>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Media manager</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Manage uploaded assets, branding media, and business documents from a centralized workspace. Media uploads will be integrated through the shared platform media API.</p>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Activity timeline</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Track recent business events, notifications, and audit actions in a centralized timeline. This helps you stay on top of operational changes.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
