import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-orbit/i18n';
import { createApiClient, type PatchAuthMeRequest, type UserProfile } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LogoUploadField } from '../../components/LogoUploadField';
import { Select } from '../../components/Select';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ensureSelectOption, languageSelectOptions, timezoneSelectOptions } from '../../config/onboarding';
import { persistLanguagePreference } from '../../i18n';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { uploadProfilePhoto } from './uploadProfilePhoto';
import { useProfileRoutes } from './profileRoutes';

const preferenceOptions = [
  { key: 'email_updates', label: 'Email reminders', helper: 'Booking updates sent by email when that channel is used.' },
  { key: 'push', label: 'Push notifications', helper: 'Mobile push alerts on devices where you are signed in.' },
  { key: 'sms_reminders', label: 'SMS reminders', helper: 'Stored for future SMS delivery (SMS provider not enabled yet).' },
  { key: 'in_app', label: 'In-app notifications', helper: 'Notifications shown in the web and ops notification center.' },
];

type NotificationPreferenceState = Record<string, boolean>;

function normalizeNotificationPreferences(raw?: Record<string, unknown> | null): NotificationPreferenceState {
  return preferenceOptions.reduce((acc, option) => {
    if (raw && option.key in raw) {
      acc[option.key] = Boolean(raw[option.key]);
    } else {
      // Default on so existing users keep receiving notifications until they opt out.
      acc[option.key] = true;
    }
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

function notificationPreferencesDirty(
  current: NotificationPreferenceState,
  initial: NotificationPreferenceState,
): boolean {
  return preferenceOptions.some((option) => current[option.key] !== initial[option.key]);
}

export function ProfileEditPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const routes = useProfileRoutes();
  const snackbar = useSnackbar();
  const theme = useTheme();
  const [formState, setFormState] = useState<Partial<UserProfile>>({});
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceState>({});
  const [initialNotificationPreferences, setInitialNotificationPreferences] = useState<NotificationPreferenceState>({});
  const [extraNotificationPreferences, setExtraNotificationPreferences] = useState<Record<string, unknown>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
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
        profile_photo: auth.user.profile_photo ?? '',
      });
      const rawPrefs = auth.user.notification_preferences && typeof auth.user.notification_preferences === 'object' ? auth.user.notification_preferences : null;
      const normalized = normalizeNotificationPreferences(rawPrefs as Record<string, unknown> | null);
      setNotificationPreferences(normalized);
      setInitialNotificationPreferences(normalized);
      setExtraNotificationPreferences(preserveExtraPreferences(rawPrefs as Record<string, unknown> | null));
      setPhotoFile(null);
    }
  }, [auth.user]);

  const timezoneOptions = useMemo(
    () => ensureSelectOption(timezoneSelectOptions, formState.timezone),
    [formState.timezone],
  );
  const languageOptions = useMemo(
    () => ensureSelectOption(languageSelectOptions, formState.language),
    [formState.language],
  );

  const client = createApiClient({ baseUrl: '/api/v1', token: auth.token ?? undefined });
  const isDirty = Boolean(
    auth.user &&
      (Boolean(photoFile) ||
        formState.first_name !== auth.user.first_name ||
        formState.last_name !== auth.user.last_name ||
        formState.phone_number !== auth.user.phone_number ||
        formState.language !== auth.user.language ||
        formState.timezone !== auth.user.timezone ||
        notificationPreferencesDirty(notificationPreferences, initialNotificationPreferences)),
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSaving(true);

    try {
      let profilePhoto = formState.profile_photo ?? auth.user?.profile_photo ?? undefined;
      if (photoFile) {
        if (!auth.token || !workspace.tenantId) {
          throw new Error('Workspace context is required to upload a profile photo.');
        }
        profilePhoto = await uploadProfilePhoto({
          accessToken: auth.token,
          tenantId: workspace.tenantId,
          businessId: workspace.businessId,
          imageFile: photoFile,
        });
      }

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
        ...(profilePhoto ? { profile_photo: profilePhoto } : {}),
      };
      await client.auth.patchMe(body);
      setActiveIntlLocale(formState.language);
      persistLanguagePreference(formState.language || 'en');
      await applyAppLanguage(formState.language);
      await auth.restore();
      snackbar.push(t('profile.updated'), 'success');
      navigate(routes.home);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('profile.updateFailed');
      setErrorMessage(message);
      snackbar.push(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="profile-page"
      style={{
        minHeight: routes.embeddedInAdmin ? undefined : '100%',
        padding: routes.embeddedInAdmin ? 0 : 8,
        color: theme.resolved === 'dark' ? '#f8fafc' : '#111827',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 24, width: '100%' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>{t('profile.eyebrow')}</p>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>{t('profile.editTitle')}</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{t('profile.editLead')}</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
            <LogoUploadField
              label={t('common.profilePhoto')}
              hint="PNG, JPG, or WebP. A square photo works best."
              dropzoneTitle="Upload profile photo"
              dropzoneSubtitle="Click to choose an image"
              previewAlt="Profile photo preview"
              value={photoFile}
              onChange={setPhotoFile}
              currentLogoUrl={resolveMediaAssetUrl(formState.profile_photo ?? auth.user?.profile_photo)}
            />
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>{t('common.firstName')}</span>
                <input
                  value={formState.first_name ?? ''}
                  onChange={(event) => setFormState({ ...formState, first_name: event.target.value })}
                  placeholder={t('common.firstName')}
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>{t('common.lastName')}</span>
                <input
                  value={formState.last_name ?? ''}
                  onChange={(event) => setFormState({ ...formState, last_name: event.target.value })}
                  placeholder={t('common.lastName')}
                  disabled={saving}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>{t('common.email')}</span>
              <input
                value={auth.user?.email ?? ''}
                readOnly
                disabled
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#e5e7eb', color: '#6b7280' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>{t('common.phone')}</span>
              <input
                value={formState.phone_number ?? ''}
                onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
                placeholder={t('common.phone')}
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
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{option.helper}</div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Select
                label={t('common.language')}
                options={languageOptions}
                value={formState.language ?? ''}
                onChange={(event) => setFormState({ ...formState, language: event.target.value })}
                disabled={saving}
                style={{ marginBottom: 0 }}
              />
              <Select
                label={t('common.timezone')}
                options={timezoneOptions}
                value={formState.timezone ?? ''}
                onChange={(event) => setFormState({ ...formState, timezone: event.target.value })}
                disabled={saving}
                style={{ marginBottom: 0 }}
              />
            </div>

            {errorMessage ? (
              <div style={{ color: '#dc2626', padding: 12, borderRadius: 12, background: '#fef2f2' }}>{errorMessage}</div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <Button variant="ghost" type="button" onClick={() => navigate(routes.home)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={!isDirty || saving}>
                {saving ? t('common.saving') : t('profile.saveProfile')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
