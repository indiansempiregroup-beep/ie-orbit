import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApiClient, type PatchAuthMeRequest, type UserProfile } from '@ie-platform/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';

const preferenceOptions = [
  { key: 'email_updates', label: 'Email reminders' },
  { key: 'sms_reminders', label: 'SMS reminders' },
];

type NotificationPreferenceState = Record<string, boolean>;

function normalizeNotificationPreferences(raw?: Record<string, unknown> | null): NotificationPreferenceState {
  return preferenceOptions.reduce((acc, option) => {
    acc[option.key] = Boolean(raw?.[option.key]);
    return acc;
  }, {} as NotificationPreferenceState);
}

function preserveExtraPreferences(raw?: Record<string, unknown> | null): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return extra;

  Object.entries(raw).forEach(([key, value]) => {
    if (!preferenceOptions.some((option) => option.key === key)) {
      extra[key] = value;
    }
  });
  return extra;
}

export function ProfileEditPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const theme = useTheme();
  const [formState, setFormState] = useState<Partial<UserProfile>>({});
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceState>({});
  const [initialNotificationPreferences, setInitialNotificationPreferences] = useState<NotificationPreferenceState>({});
  const [extraNotificationPreferences, setExtraNotificationPreferences] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (auth.user) {
      setFormState({
        first_name: auth.user.first_name ?? '',
        last_name: auth.user.last_name ?? '',
        phone_number: auth.user.phone_number ?? '',
        language: auth.user.language ?? '',
        timezone: auth.user.timezone ?? '',
      });
      const rawPrefs = auth.user.notification_preferences && typeof auth.user.notification_preferences === 'object' ? auth.user.notification_preferences : null;
      const normalized = normalizeNotificationPreferences(rawPrefs as Record<string, unknown> | null);
      setNotificationPreferences(normalized);
      setInitialNotificationPreferences(normalized);
      setExtraNotificationPreferences(preserveExtraPreferences(rawPrefs as Record<string, unknown> | null));
    }
  }, [auth.user]);

  const client = createApiClient({ baseUrl: '/api/v1', token: auth.token ?? undefined });
  const isDirty = Boolean(
    auth.user &&
      (formState.first_name !== auth.user.first_name ||
        formState.last_name !== auth.user.last_name ||
        formState.phone_number !== auth.user.phone_number ||
        formState.language !== auth.user.language ||
        formState.timezone !== auth.user.timezone ||
        notificationPreferences !== initialNotificationPreferences),
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSaving(true);

    try {
      const body: PatchAuthMeRequest = {
        first_name: formState.first_name,
        last_name: formState.last_name,
        phone_number: formState.phone_number,
        language: formState.language,
        timezone: formState.timezone,
        notification_preferences: {
          ...extraNotificationPreferences,
          ...notificationPreferences,
        },
      };
      await client.auth.patchMe(body);
      await auth.restore();
      snackbar.push('Profile updated successfully.', 'success');
      navigate('/profile');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update profile. Please try again.';
      setErrorMessage(message);
      snackbar.push(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Personal profile</p>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>Edit your profile</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Keep your name, phone, language, and timezone up to date for a smoother workspace experience.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>First name</span>
                <input
                  value={formState.first_name ?? ''}
                  onChange={(event) => setFormState({ ...formState, first_name: event.target.value })}
                  placeholder="First name"
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>Last name</span>
                <input
                  value={formState.last_name ?? ''}
                  onChange={(event) => setFormState({ ...formState, last_name: event.target.value })}
                  placeholder="Last name"
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>Email</span>
              <input
                value={auth.user?.email ?? ''}
                readOnly
                disabled
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#e5e7eb', color: '#6b7280' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>Phone number</span>
              <input
                value={formState.phone_number ?? ''}
                onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
                placeholder="Phone number"
                disabled={saving}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
              />
            </label>
            <fieldset style={{ display: 'grid', gap: 12, border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#f8fafc' }}>
              <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Notification preferences</legend>
              <div style={{ display: 'grid', gap: 10 }}>
                {preferenceOptions.map((option) => (
                  <label key={option.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: '1px solid #e5e7eb' }}>
                    <input
                      type="checkbox"
                      checked={notificationPreferences[option.key] ?? false}
                      disabled={saving}
                      onChange={() =>
                        setNotificationPreferences((current) => ({
                          ...current,
                          [option.key]: !current[option.key],
                        }))
                      }
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{option.label}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        Receive this type of notification from the platform.
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {Object.keys(extraNotificationPreferences).length > 0 ? (
                <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 12, background: '#eff6ff' }}>
                  Preserving additional notification settings: {JSON.stringify(extraNotificationPreferences)}
                </div>
              ) : null}
            </fieldset>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>Language</span>
                <input
                  value={formState.language ?? ''}
                  onChange={(event) => setFormState({ ...formState, language: event.target.value })}
                  placeholder="English"
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>Timezone</span>
                <input
                  value={formState.timezone ?? ''}
                  onChange={(event) => setFormState({ ...formState, timezone: event.target.value })}
                  placeholder="UTC"
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
            </div>

            {errorMessage ? (
              <div style={{ color: '#dc2626', padding: 12, borderRadius: 12, background: '#fef2f2' }}>{errorMessage}</div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <Button variant="ghost" type="button" onClick={() => navigate('/profile')} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!isDirty || saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
