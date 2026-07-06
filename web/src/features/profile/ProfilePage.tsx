import React from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../hooks/useTheme';
import { useProfileDetails } from './profileHooks';

export function ProfilePage() {
  const theme = useTheme();
  const profile = useProfileDetails();
  const user = profile.user;

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>User Profile</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Profile</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Manage your account details, role access, and notification preferences.</p>
          </div>
          <Button variant="primary" onClick={() => profile.logout()} disabled={profile.loading}>
            {profile.loading ? 'Signing out…' : 'Sign out'}
          </Button>
        </header>

        <Card style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Name</p>
            <h2 style={{ margin: 0, fontSize: 24 }}>{user?.full_name ?? 'Your name'}</h2>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Email</p>
            <p style={{ margin: 0 }}>{user?.email ?? 'No email available'}</p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Status</p>
            <p style={{ margin: 0 }}>{user?.status ?? 'Unknown'}</p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Roles</p>
            <p style={{ margin: 0 }}>{user?.roles?.join(', ') ?? 'No roles assigned'}</p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Permissions</p>
            <p style={{ margin: 0 }}>{user?.permissions?.join(', ') ?? 'No permissions available'}</p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Notification preferences</p>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>{user?.notification_preferences ? JSON.stringify(user.notification_preferences, null, 2) : 'Default settings active'}</pre>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Profile actions</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Update your profile information and account settings from the main business workspace.</p>
            <Button variant="ghost">Update profile</Button>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Security</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Control your session and sign-out actions. Strong authentication keeps your business data safe.</p>
            <Button variant="ghost">Manage security</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
