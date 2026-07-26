import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApiClient } from '@ie-platform/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useProfileRoutes } from './profileRoutes';

export function ProfileSecurityPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const routes = useProfileRoutes();
  const snackbar = useSnackbar();
  const theme = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const client = createApiClient({ baseUrl: '/api/v1', token: auth.token ?? undefined });
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = Boolean(currentPassword.trim() && newPassword.trim() && confirmPassword.trim() && passwordsMatch && newPassword.length >= 8);

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (!passwordsMatch) {
      setErrorMessage('New passwords do not match.');
      return;
    }
    setSaving(true);

    try {
      await client.auth.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      snackbar.push('Password changed successfully.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update password. Please try again.';
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
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Security</p>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>Change password</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Protect your account with a stronger password and sign-in controls.</p>
        </div>

        <Card>
          <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 18 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter current password"
                required
                disabled={saving}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new password"
                required
                disabled={saving}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280' }}>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat new password"
                required
                disabled={saving}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
              />
            </label>

            {errorMessage ? (
              <div style={{ color: '#dc2626', padding: 12, borderRadius: 12, background: '#fef2f2' }}>{errorMessage}</div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <Button variant="ghost" type="button" onClick={() => navigate(-1)} disabled={saving}>
                Back
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit || saving}>
                {saving ? 'Updating…' : 'Update password'}
              </Button>
            </div>

            <div style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>
              Passwords must be at least 8 characters long. After changing your password, you may need to sign in again on other devices.
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
