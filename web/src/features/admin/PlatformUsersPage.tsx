import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlatformUserFilter, PlatformUserRow, PlatformUserSearchParams } from '@ie-orbit/sdk';
import { KeyRound, Lock, MailWarning, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { useApiClient } from '../../hooks/useApiClient';
import { useDebounce } from '../../hooks/useDebounce';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatDate, formatTimestamp } from '../../lib/datetime';
import {
  AdminChip,
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminTable,
  downloadTextFile,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformUserSearchQuery } from './adminHooks';

type UserAction = 'disable' | 'enable' | 'reset_password';
type TenantScope = NonNullable<PlatformUserSearchParams['tenants']>;
type SortKey = NonNullable<PlatformUserSearchParams['sort']>;

const STATUS_FILTERS: Array<{ value: PlatformUserFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'locked', label: 'Locked' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'never_logged_in', label: 'Never signed in' },
];

const TENANT_SCOPES: Array<{ value: TenantScope; label: string }> = [
  { value: 'all', label: 'Any workspace link' },
  { value: 'owners', label: 'Workspace owners only' },
  { value: 'none', label: 'No workspace' },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'last_login', label: 'Recently active' },
  { value: 'stale', label: 'Dormant first' },
  { value: 'email', label: 'Email A–Z' },
  { value: 'name', label: 'Name A–Z' },
];

const JOINED_WINDOWS = [
  { value: 0, label: 'Any time' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
];

const ACTION_COPY: Record<UserAction, { title: string; description: string; confirm: string; tone: string }> = {
  disable: {
    title: 'Disable user',
    description: 'The user is signed out and cannot log in until re-enabled.',
    confirm: 'Disable user',
    tone: 'admin-btn--danger',
  },
  enable: {
    title: 'Enable user',
    description: 'Restores sign-in access for this account.',
    confirm: 'Enable user',
    tone: 'admin-btn--primary',
  },
  reset_password: {
    title: 'Send password reset',
    description: 'Emails a password reset link to the user’s address.',
    confirm: 'Send reset email',
    tone: 'admin-btn--primary',
  },
};

function initials(user: PlatformUserRow) {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

function userTags(user: PlatformUserRow) {
  const tags: Array<{ label: string; tone: 'good' | 'warn' | 'danger' | 'neutral' }> = [];
  if (!user.is_active) tags.push({ label: 'disabled', tone: 'danger' });
  if (user.is_locked) tags.push({ label: 'locked', tone: 'danger' });
  if (user.status === 'suspended') tags.push({ label: 'suspended', tone: 'danger' });
  if (user.email_verified === false) tags.push({ label: 'unverified', tone: 'warn' });
  if (tags.length === 0) tags.push({ label: 'active', tone: 'good' });
  return tags;
}

function UserTags({ user }: { user: PlatformUserRow }) {
  return (
    <div className="admin-tag-row">
      {userTags(user).map((tag) => (
        <span key={tag.label} className={`admin-status admin-status--${tag.tone}`}>
          {tag.label}
        </span>
      ))}
    </div>
  );
}

export function PlatformUsersPage() {
  usePageMeta({ title: 'Users — Platform Admin' });
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PlatformUserFilter>('all');
  const [role, setRole] = useState('all');
  const [tenants, setTenants] = useState<TenantScope>('all');
  const [joinedWithinDays, setJoinedWithinDays] = useState(0);
  const [sort, setSort] = useState<SortKey>('recent');
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);

  const [detailUser, setDetailUser] = useState<PlatformUserRow | null>(null);
  const [pending, setPending] = useState<{ user: PlatformUserRow; action: UserAction } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, status, role, tenants, joinedWithinDays, sort, pageSize]);

  const usersQuery = usePlatformUserSearchQuery({
    q: debouncedSearch,
    status,
    role: role === 'all' ? undefined : role,
    tenants: tenants === 'all' ? undefined : tenants,
    joined_within_days: joinedWithinDays || undefined,
    sort,
    limit: pageSize,
    offset,
  });

  const result = usersQuery.data;
  const users = result?.users ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts ?? {};
  const roleOptions = result?.roles ?? [];

  const activeFilters = useMemo(
    () =>
      [
        debouncedSearch ? `“${debouncedSearch}”` : null,
        status !== 'all' ? STATUS_FILTERS.find((item) => item.value === status)?.label : null,
        role !== 'all' ? role.replace(/_/g, ' ') : null,
        tenants !== 'all' ? TENANT_SCOPES.find((item) => item.value === tenants)?.label : null,
        joinedWithinDays ? JOINED_WINDOWS.find((item) => item.value === joinedWithinDays)?.label : null,
      ].filter(Boolean) as string[],
    [debouncedSearch, status, role, tenants, joinedWithinDays],
  );

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setRole('all');
    setTenants('all');
    setJoinedWithinDays(0);
    setSort('recent');
  }

  function openAction(user: PlatformUserRow, action: UserAction) {
    setPending({ user, action });
    setReason(
      action === 'reset_password'
        ? 'support requested password reset'
        : `${action} account on platform admin request`,
    );
    setError(null);
  }

  async function confirmAction() {
    if (!pending) return;
    if (reason.trim().length < 3) {
      setError('Reason is required for the audit log (min 3 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await client.platform.userAction(pending.user.id, pending.action, {
        reason: reason.trim(),
      });
      if (pending.action === 'reset_password') {
        const issued = Boolean((response.data as { reset_issued?: boolean }).reset_issued);
        setMessage(
          issued
            ? `Password reset email sent to ${pending.user.email}.`
            : `Password reset requested for ${pending.user.email}.`,
        );
      } else {
        setMessage(
          pending.action === 'enable'
            ? `${pending.user.email} can sign in again.`
            : `${pending.user.email} is now disabled.`,
        );
      }
      setPending(null);
      setDetailUser(null);
      invalidate();
      await usersQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ['Email', 'Name', 'Phone', 'Roles', 'Status', 'Workspaces', 'Signed up', 'Last login'];
    const rows = users.map((user) => [
      user.email,
      user.full_name ?? '',
      user.phone_number ?? '',
      (user.roles ?? []).join(' | '),
      userTags(user)
        .map((tag) => tag.label)
        .join(' | '),
      (user.owned_tenants ?? []).map((tenant) => tenant.display_name || tenant.slug).join(' | '),
      user.created_at ?? '',
      user.last_login ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadTextFile('platform-users.csv', csv);
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + pageSize, total);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Users"
        description="Browse every platform account. Filter by status, role, or workspace link, then disable, enable, or reset a password with an audited reason."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={users.length === 0}
            onClick={exportCsv}
          >
            Export page CSV
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Matching users" value={counts.all ?? 0} icon={<Users size={16} />} />
        <AdminKpi label="Active" value={counts.active ?? 0} tone="good" icon={<UserCheck size={16} />} />
        <AdminKpi label="Disabled" value={counts.disabled ?? 0} tone="danger" icon={<UserX size={16} />} />
        <AdminKpi label="Locked out" value={counts.locked ?? 0} tone="warn" icon={<Lock size={16} />} />
        <AdminKpi
          label="Unverified email"
          value={counts.unverified ?? 0}
          tone="warn"
          icon={<MailWarning size={16} />}
        />
        <AdminKpi
          label="Never signed in"
          value={counts.never_logged_in ?? 0}
          icon={<ShieldCheck size={16} />}
        />
      </div>

      <AdminSection
        title="Directory"
        description={
          total === 0
            ? 'No users match the current filters'
            : `Showing ${rangeStart}–${rangeEnd} of ${total} users`
        }
        actions={
          activeFilters.length > 0 ? (
            <button type="button" className="admin-btn admin-btn--ghost" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null
        }
      >
        <div className="admin-toolbar">
          <AdminSearch value={search} onChange={setSearch} placeholder="Search name, email, or phone" />
          <div className="admin-chip-row">
            {STATUS_FILTERS.map((item) => (
              <AdminChip key={item.value} active={status === item.value} onClick={() => setStatus(item.value)}>
                {item.label}
                {counts[item.value] != null ? ` · ${counts[item.value]}` : ''}
              </AdminChip>
            ))}
          </div>
        </div>

        <div className="admin-filter-row">
          <AdminField label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option>
              {roleOptions.map((code) => (
                <option key={code} value={code}>
                  {code.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Workspace">
            <select value={tenants} onChange={(event) => setTenants(event.target.value as TenantScope)}>
              {TENANT_SCOPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Signed up">
            <select
              value={joinedWithinDays}
              onChange={(event) => setJoinedWithinDays(Number(event.target.value))}
            >
              {JOINED_WINDOWS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Sort by">
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Per page">
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </AdminField>
        </div>

        {activeFilters.length > 0 ? (
          <p className="admin-message">Filtered by {activeFilters.join(' · ')}</p>
        ) : null}
        {message ? <p className="admin-message admin-message--ok">{message}</p> : null}

        {usersQuery.isLoading ? (
          <AdminEmpty>Loading users…</AdminEmpty>
        ) : usersQuery.error ? (
          <p className="admin-message" style={{ color: '#be123c' }}>
            {usersQuery.error.message}
          </p>
        ) : users.length === 0 ? (
          <AdminEmpty
            title="No users match these filters"
            action={
              activeFilters.length > 0 ? (
                <button type="button" className="admin-btn admin-btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
          >
            Try a broader search term or reset the status and workspace filters.
          </AdminEmpty>
        ) : (
          <>
            <div className={usersQuery.isFetching ? 'admin-table-loading' : undefined}>
              <AdminTable columns={['User', 'Roles', 'Workspaces', 'Signed up', 'Last login', 'Status', '']}>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <button type="button" className="admin-user-cell" onClick={() => setDetailUser(user)}>
                        <span className="admin-avatar" aria-hidden>
                          {initials(user)}
                        </span>
                        <span>
                          <span className="admin-user-cell__name">{user.full_name || user.email}</span>
                          <span className="admin-table__muted">{user.email}</span>
                        </span>
                      </button>
                    </td>
                    <td>
                      {(user.roles ?? []).length === 0 ? (
                        <span className="admin-table__muted">—</span>
                      ) : (
                        <div className="admin-tag-row">
                          {(user.roles ?? []).map((code) => (
                            <span key={code} className="admin-tag">
                              {code.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {(user.owned_tenants ?? []).length === 0 ? (
                        <span className="admin-table__muted">—</span>
                      ) : (
                        <div className="admin-tag-row">
                          {(user.owned_tenants ?? []).map((tenant) => (
                            <Link key={tenant.id} to={`/admin/tenants/${tenant.id}`}>
                              {tenant.display_name || tenant.slug}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="admin-table__muted">{formatDate(user.created_at)}</td>
                    <td className="admin-table__muted">
                      {user.last_login ? formatDate(user.last_login) : 'Never'}
                    </td>
                    <td>
                      <UserTags user={user} />
                    </td>
                    <td className="admin-table__actions">
                      <div className="admin-row-actions">
                        {user.is_active ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={() => openAction(user, 'disable')}
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            onClick={() => openAction(user, 'enable')}
                          >
                            Enable
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-icon-btn"
                          title="Send password reset"
                          aria-label={`Send password reset to ${user.email}`}
                          onClick={() => openAction(user, 'reset_password')}
                        >
                          <KeyRound size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <div className="admin-pager">
              <span className="admin-table__muted">
                Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={rangeEnd >= total}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </AdminSection>

      <AdminDrawer
        open={Boolean(detailUser)}
        title={detailUser?.full_name || detailUser?.email || 'User'}
        description={detailUser?.email}
        onClose={() => setDetailUser(null)}
      >
        {detailUser ? (
          <div className="admin-detail-grid">
            <UserTags user={detailUser} />
            <dl className="admin-detail-list">
              <div>
                <dt>Phone</dt>
                <dd>{detailUser.phone_number || '—'}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>{(detailUser.status || 'unknown').replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt>Signed up</dt>
                <dd>{formatTimestamp(detailUser.created_at)}</dd>
              </div>
              <div>
                <dt>Last login</dt>
                <dd>{detailUser.last_login ? formatTimestamp(detailUser.last_login) : 'Never'}</dd>
              </div>
              <div>
                <dt>Roles</dt>
                <dd>{(detailUser.roles ?? []).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt>Owned workspaces</dt>
                <dd>
                  {(detailUser.owned_tenants ?? []).length === 0
                    ? '—'
                    : (detailUser.owned_tenants ?? []).map((tenant) => (
                        <div key={tenant.id}>
                          <Link to={`/admin/tenants/${tenant.id}`}>{tenant.display_name || tenant.slug}</Link>
                        </div>
                      ))}
                </dd>
              </div>
            </dl>
            <div className="admin-action-bar">
              {detailUser.is_active ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--danger"
                  onClick={() => openAction(detailUser, 'disable')}
                >
                  Disable user
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  onClick={() => openAction(detailUser, 'enable')}
                >
                  Enable user
                </button>
              )}
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={() => openAction(detailUser, 'reset_password')}
              >
                Send password reset
              </button>
            </div>
          </div>
        ) : null}
      </AdminDrawer>

      <AdminDrawer
        open={Boolean(pending)}
        variant="sheet"
        title={pending ? ACTION_COPY[pending.action].title : ''}
        description={pending ? `${ACTION_COPY[pending.action].description} · ${pending.user.email}` : undefined}
        onClose={() => {
          if (busy) return;
          setPending(null);
          setError(null);
        }}
        footer={
          <div className="admin-action-bar" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`admin-btn ${pending ? ACTION_COPY[pending.action].tone : ''}`}
              disabled={busy}
              onClick={() => void confirmAction()}
            >
              {busy ? 'Working…' : pending ? ACTION_COPY[pending.action].confirm : ''}
            </button>
          </div>
        }
      >
        <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
          <AdminField label="Reason (audit log)" hint="Recorded against your admin account.">
            <input
              value={reason}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you doing this?"
            />
          </AdminField>
          {error ? (
            <p className="admin-message" style={{ color: '#be123c', margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformUsersPage;
