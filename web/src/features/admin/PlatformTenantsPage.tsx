import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import {
  AdminChip,
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminStatus,
  AdminTable,
  downloadTextFile,
  productLabel,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformTenantsQuery } from './adminHooks';

export function PlatformTenantsPage() {
  usePageMeta({ title: 'Tenants — Platform Admin' });
  const tenantsQuery = usePlatformTenantsQuery();
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [reason, setReason] = useState('create tenant');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const tenants = tenantsQuery.data ?? [];
  const statuses = useMemo(() => {
    const unique = Array.from(new Set(tenants.map((tenant) => tenant.status).filter(Boolean)));
    return ['all', ...unique];
  }, [tenants]);

  const billingStates = ['all', 'trialing', 'paying', 'complimentary', 'soft_locked', 'canceled', 'none'];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
      const matchesBilling = billingFilter === 'all' || (tenant.billing_state || 'none') === billingFilter;
      const matchesQuery =
        !needle ||
        tenant.display_name.toLowerCase().includes(needle) ||
        tenant.slug.toLowerCase().includes(needle) ||
        (tenant.plan_code || '').toLowerCase().includes(needle) ||
        (tenant.product_code || '').toLowerCase().includes(needle) ||
        (tenant.products ?? []).some(
          (product) =>
            (product.plan_code || '').toLowerCase().includes(needle) ||
            product.product_code.toLowerCase().includes(needle),
        );
      return matchesStatus && matchesBilling && matchesQuery;
    });
  }, [tenants, query, statusFilter, billingFilter]);

  function resetCreateForm() {
    setDisplayName('');
    setOwnerEmail('');
    setReason('create tenant');
    setError(null);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const result = await client.platform.exportCsv('tenants');
      downloadTextFile('tenants.csv', typeof result.data === 'string' ? result.data : String(result.data ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Tenants"
        description="Search workspaces by name, slug, or plan. Filter by workspace status or billing state."
        actions={
          <>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreateOpen(true)}>
              New tenant
            </button>
          </>
        }
      />

      <AdminSection title="Directory" description={`${filtered.length} of ${tenants.length} workspaces`}>
        <div className="admin-toolbar">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search by name or slug" />
          <div className="admin-chip-row">
            {statuses.map((status) => (
              <AdminChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </AdminChip>
            ))}
          </div>
          <div className="admin-chip-row">
            {billingStates.map((state) => (
              <AdminChip
                key={state}
                active={billingFilter === state}
                onClick={() => setBillingFilter(state)}
              >
                {state === 'all' ? 'all billing' : state.replace(/_/g, ' ')}
              </AdminChip>
            ))}
          </div>
        </div>

        {tenantsQuery.isLoading ? (
          <AdminEmpty>Loading tenants…</AdminEmpty>
        ) : tenantsQuery.error ? (
          <p className="admin-message" style={{ color: '#be123c' }}>
            {tenantsQuery.error.message}
          </p>
        ) : filtered.length === 0 ? (
          <AdminEmpty title="No matching tenants" action={
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreateOpen(true)}>
              Create tenant
            </button>
          }>
            Try a different search, or provision a new workspace.
          </AdminEmpty>
        ) : (
          <AdminTable columns={['Workspace', 'Plan', 'Billing', 'Last payment', 'Status']}>
            {filtered.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <Link to={`/admin/tenants/${tenant.id}`}>
                    <span className="admin-swatch" style={{ background: tenant.primary_color || '#2563eb' }} />
                    {tenant.display_name}
                  </Link>
                  <div className="admin-table__muted">{tenant.slug}</div>
                </td>
                <td>
                  {(tenant.products ?? []).length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(tenant.products ?? []).map((product) => (
                        <div key={product.product_code}>
                          {product.plan_code || '—'}
                          <div className="admin-table__muted">
                            {productLabel(product.product_code)}
                            {product.billing_state ? ` · ${product.billing_state.replace(/_/g, ' ')}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {tenant.plan_code || '—'}
                      {tenant.product_code ? (
                        <div className="admin-table__muted">{productLabel(tenant.product_code)}</div>
                      ) : null}
                    </>
                  )}
                </td>
                <td>
                  <AdminStatus status={tenant.billing_state || 'none'} />
                  {(tenant.pending_claims ?? 0) > 0 ? (
                    <div className="admin-table__muted">{tenant.pending_claims} UPI claim{tenant.pending_claims === 1 ? '' : 's'}</div>
                  ) : null}
                </td>
                <td>
                  {tenant.last_paid_paise != null
                    ? `₹${Math.round(tenant.last_paid_paise / 100).toLocaleString('en-IN')}`
                    : '—'}
                  <div className="admin-table__muted">
                    {tenant.last_paid_at ? formatTimestamp(tenant.last_paid_at) : 'No payment'}
                  </div>
                </td>
                <td>
                  <AdminStatus status={tenant.status} />
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminSection>

      <AdminDrawer
        open={createOpen}
        title="Create tenant"
        description="The owner must already exist. A starter AppointIE business is provisioned automatically."
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
      >
        <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
          <AdminField label="Display name">
            <input
              value={displayName}
              placeholder="Acme Salon"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </AdminField>
          <AdminField label="Owner email" hint="Optional. Must already be a registered user.">
            <input
              type="email"
              value={ownerEmail}
              placeholder="owner@example.com"
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </AdminField>
          <AdminField label="Reason (audit log)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </AdminField>
          {error ? (
            <p className="admin-message" style={{ color: '#be123c', margin: 0 }}>
              {error}
            </p>
          ) : null}
          <div className="admin-action-bar">
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
                  resetCreateForm();
                  setCreateOpen(false);
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
        </div>
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformTenantsPage;
