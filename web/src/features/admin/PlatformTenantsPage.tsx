import { useState } from 'react';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminListRow,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformTenantsQuery } from './adminHooks';

export function PlatformTenantsPage() {
  usePageMeta({ title: 'Tenants — Platform Admin' });
  const tenantsQuery = usePlatformTenantsQuery();
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  const [displayName, setDisplayName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [reason, setReason] = useState('create tenant');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Tenants"
        description="Review workspace status, open tenant detail, or provision a new business."
        actions={
          <a className="admin-btn admin-btn--secondary" href="/api/v1/platform/exports/tenants">
            Export CSV
          </a>
        }
      />

      <div className="admin-split">
        <AdminSection title="Directory" description={`${tenantsQuery.data?.length ?? 0} workspaces`}>
          {tenantsQuery.isLoading ? (
            <AdminEmpty>Loading tenants…</AdminEmpty>
          ) : tenantsQuery.error ? (
            <p style={{ color: '#be123c', margin: 0 }}>{tenantsQuery.error.message}</p>
          ) : (
            <div className="admin-list">
              {(tenantsQuery.data ?? []).map((tenant) => (
                <AdminListRow
                  key={tenant.id}
                  href={`/admin/tenants/${tenant.id}`}
                  title={tenant.display_name}
                  meta={`${tenant.slug} · ${tenant.business_count} business(es)`}
                  trailing={<AdminStatus status={tenant.status} />}
                />
              ))}
              {(tenantsQuery.data ?? []).length === 0 ? <AdminEmpty>No tenants found.</AdminEmpty> : null}
            </div>
          )}
        </AdminSection>

        <AdminSection
          title="Create tenant"
          description="Owner must already exist. A starter AppointIE business is provisioned automatically."
        >
          <div className="admin-form-grid">
            <input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              placeholder="Owner email (existing user)"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
            <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {error ? <p style={{ color: '#be123c', margin: 0 }}>{error}</p> : null}
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy || !displayName.trim()}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await client.platform.createTenant({
                    display_name: displayName,
                    owner_email: ownerEmail || undefined,
                    reason,
                  });
                  setDisplayName('');
                  setOwnerEmail('');
                  invalidate();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Create failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Creating…' : 'Create tenant'}
            </button>
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformTenantsPage;
