import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useEmailVerification } from '../../hooks/useEmailVerification';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { useProfileDetails } from './profileHooks';
import { useProfileRoutes } from './profileRoutes';

const notificationPreferenceLabels: Record<string, string> = {
  email: 'Email notifications',
  push: 'Push notifications',
  sms: 'SMS reminders',
  email_updates: 'Email notifications',
  sms_reminders: 'SMS reminders',
};

function renderNotificationPreferenceValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  return String(value);
}

export function ProfilePage() {
  const profile = useProfileDetails();
  const user = profile.user;
  const navigate = useNavigate();
  const routes = useProfileRoutes();
  const { isVerified, resendState, message, resendVerification } = useEmailVerification();

  return (
    <div
      className="profile-page"
      style={{
        minHeight: routes.embeddedInAdmin ? undefined : '100%',
        padding: routes.embeddedInAdmin ? 0 : 8,
        color: routes.embeddedInAdmin ? undefined : '#111827',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 24, width: '100%' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 8 }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>User Profile</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32, lineHeight: 1.2 }}>Profile</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280', maxWidth: 720 }}>Manage your account details, role access, and notification preferences.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate(routes.edit)}>
              Edit profile
            </Button>
            <Button variant="ghost" onClick={() => profile.logout()} disabled={profile.loading}>
              {profile.loading ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        <Card style={{ padding: 24 }}>
          <div style={{ display: 'grid', gap: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {resolveMediaAssetUrl(user?.profile_photo) ? (
                <img
                  src={resolveMediaAssetUrl(user?.profile_photo) ?? undefined}
                  alt={user?.full_name ?? 'Profile'}
                  style={{ width: 72, height: 72, borderRadius: 999, objectFit: 'cover', border: '1px solid #e5e7eb' }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    background: '#e0f2fe',
                    color: '#0369a1',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 28,
                  }}
                >
                  {(user?.full_name ?? user?.email ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Your profile</p>
                <h2 style={{ margin: 0, fontSize: 24 }}>{user?.full_name ?? 'Profile details'}</h2>
                <p style={{ margin: 0, color: '#6b7280' }}>Personal and account-related information is shown below. Edit your profile to update these details.</p>
              </div>
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
                <strong style={{ color: isVerified ? '#047857' : '#b45309' }}>
                  {isVerified ? 'Yes' : 'No — verification required'}
                </strong>
                {!isVerified ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <Button
                      variant="primary"
                      type="button"
                      onClick={() => void resendVerification()}
                      disabled={resendState === 'loading' || resendState === 'sent'}
                    >
                      {resendState === 'loading' ? 'Sending…' : resendState === 'sent' ? 'Email sent' : 'Resend verification email'}
                    </Button>
                    <Link to="/auth/verify-email">
                      <Button variant="ghost" type="button">
                        Open verification page
                      </Button>
                    </Link>
                  </div>
                ) : null}
                {message && !isVerified ? (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>{message}</p>
                ) : null}
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
                  {Object.entries(user.notification_preferences)
                    .filter(([key]) => key !== 'in_app')
                    .map(([key, value]) => (
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
              <Button variant="ghost" onClick={() => navigate(routes.security)}>
                Manage security
              </Button>
              <Button variant="ghost" onClick={() => navigate(routes.sessions)}>
                Review sessions
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
