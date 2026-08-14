import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminField,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminStatus,
  AdminTable,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformUserSearchQuery } from './adminHooks';

export function PlatformUsersPage() {
  usePageMeta({ title: 'Users — Platform Admin' });
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('platform admin user action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const usersQuery = usePlatformUserSearchQuery(email);

  async function act(userId: string, action: 'disable' | 'enable' | 'reset_password') {
    if (reason.trim().length < 3) {
      setMessage('Reason is required for the audit log.');
      return;
    }
    setBusy(`${action}:${userId}`);
    setMessage(null);
    try {
      const result = await client.platform.userAction(userId, action, { reason: reason.trim() });
      if (action === 'reset_password') {
        const issued = Boolean((result.data as { reset_issued?: boolean }).reset_issued);
        setMessage(issued ? 'Password reset email issued.' : 'Reset was requested.');
      } else {
        setMessage(action === 'enable' ? 'User enabled.' : 'User disabled.');
      }
      invalidate();
      await usersQuery.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const users = usersQuery.data ?? [];

  return (
    <AdminPage>
      <AdminPageHeader
        title="User search"
        description="Find users by email, then disable, enable, or send a password reset."
      />
      <AdminSection title="Search">
        <div className="admin-form-grid">
          <AdminSearch value={email} onChange={setEmail} placeholder="Email contains…" />
          <AdminField label="Reason (audit log)">
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </AdminField>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
      </AdminSection>
      <AdminSection title="Results">
        {email.trim().length < 2 ? (
          <AdminEmpty>Type at least 2 characters of an email address.</AdminEmpty>
        ) : usersQuery.isLoading ? (
          <AdminEmpty>Searching…</AdminEmpty>
        ) : users.length === 0 ? (
          <AdminEmpty>No users match that email.</AdminEmpty>
        ) : (
          <AdminTable columns={['User', 'Roles', 'Tenants', 'Status', '']}>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.full_name || user.email}</strong>
                  <div className="admin-list-row__meta">{user.email}</div>
                </td>
                <td>{(user.roles ?? []).join(', ') || '—'}</td>
                <td>
                  {(user.owned_tenants ?? []).length === 0
                    ? '—'
                    : (user.owned_tenants ?? []).map((tenant, index) => (
                        <span key={tenant.id}>
                          {index > 0 ? ', ' : null}
                          <Link to={`/admin/tenants/${tenant.id}`}>{tenant.display_name || tenant.slug}</Link>
                        </span>
                      ))}
                </td>
                <td>
                  <AdminStatus status={user.is_active ? 'active' : 'inactive'} />
                </td>
                <td>
                  <div className="admin-action-bar" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
                    {user.is_active ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={Boolean(busy)}
                        onClick={() => void act(user.id, 'disable')}
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void act(user.id, 'enable')}
                      >
                        Enable
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={Boolean(busy)}
                      onClick={() => void act(user.id, 'reset_password')}
                    >
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminSection>
    </AdminPage>
  );
}

export default PlatformUsersPage;
