import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../hooks/useTheme';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useProfileDetails } from './profileHooks';

const notificationPreferenceLabels: Record<string, string> = {
  email_updates: 'Email reminders',
  sms_reminders: 'SMS reminders',
};

function renderNotificationPreferenceValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  return String(value);
}

export function ProfilePage() {
  const theme = useTheme();
  const profile = useProfileDetails();
  const user = profile.user;
  const navigate = useNavigate();
  const snackbar = useSnackbar();

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 8 }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>User Profile</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32, lineHeight: 1.2 }}>Profile</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280', maxWidth: 720 }}>Manage your account details, role access, and notification preferences.</p>
          </div>
          <Button variant="primary" onClick={() => profile.logout()} disabled={profile.loading}>
            {profile.loading ? 'Signing out…' : 'Sign out'}
          </Button>
        </header>

        <Card style={{ padding: 24 }}>
          <div style={{ display: 'grid', gap: 24 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Your profile</p>
              <h2 style={{ margin: 0, fontSize: 24 }}>{user?.full_name ?? 'Profile details'}</h2>
              <p style={{ margin: 0, color: '#6b7280' }}>Personal and account-related information is shown below. Edit your profile to update these details.</p>
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>First name</span>
                <strong>{user?.first_name ?? 'Not provided'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Last name</span>
                <strong>{user?.last_name ?? 'Not provided'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Email</span>
                <strong>{user?.email ?? 'Not provided'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Phone</span>
                <strong>{user?.phone_number ?? 'Not provided'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Language</span>
                <strong>{user?.language ?? 'Not provided'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Timezone</span>
                <strong>{user?.timezone ?? 'Not provided'}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Status</span>
                <strong>{user?.status ?? 'Unknown'}</strong>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Email verified</span>
                <strong>{user?.email_verified_at ? 'Yes' : 'No'}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Roles</span>
                {user?.roles?.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {user.roles.map((role) => (
                      <span key={role} style={{ padding: '6px 10px', borderRadius: 9999, background: '#e0f2fe', color: '#0369a1', fontSize: 13 }}>
                        {role}
                      </span>
                    ))}
                  </div>
                ) : (
                  <strong>No roles assigned</strong>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Permissions</span>
                {user?.permissions?.length ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {user.permissions.map((permission) => (
                      <span key={permission} style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 9999, background: '#ecfdf5', color: '#166534', fontSize: 13 }}>
                        {permission}
                      </span>
                    ))}
                  </div>
                ) : (
                  <strong>No permissions available</strong>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Notification preferences</span>
              {user?.notification_preferences && typeof user.notification_preferences === 'object' ? (
                <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  {Object.entries(user.notification_preferences).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{notificationPreferenceLabels[key] ?? key}</span>
                      <span style={{ color: '#6b7280' }}>{renderNotificationPreferenceValue(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <strong>Default settings active</strong>
              )}
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card style={{ padding: 18 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Security</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Secure your account with password controls and active session review tools.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <Button variant="ghost" onClick={() => navigate('/profile/edit')}>
                Edit profile
              </Button>
              <Button variant="ghost" onClick={() => navigate('/profile/security')}>
                Manage security
              </Button>
              <Button variant="ghost" onClick={() => navigate('/profile/sessions')}>
                Review sessions
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
