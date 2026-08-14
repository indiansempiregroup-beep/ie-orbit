import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { formatTimestamp } from '../../lib/datetime';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminField,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  downloadTextFile,
  humanizeAction,
} from './AdminChrome';
import { usePlatformAuditQuery, usePlatformTenantsQuery } from './adminHooks';

export function PlatformAuditPage() {
  usePageMeta({ title: 'Audit — Platform Admin' });
  const client = useApiClient();
  const tenantsQuery = usePlatformTenantsQuery();
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [exporting, setExporting] = useState(false);
  const auditQuery = usePlatformAuditQuery({
    limit: 100,
    tenant_id: tenantId || undefined,
    action: action.trim() || undefined,
  });

  const tenantOptions = useMemo(
    () =>
      (tenantsQuery.data ?? []).map((tenant) => ({
        id: tenant.id,
        label: tenant.display_name || tenant.slug,
      })),
    [tenantsQuery.data],
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const result = await client.platform.exportCsv('audit', {
        tenant_id: tenantId || undefined,
        action: action.trim() || undefined,
      });
      downloadTextFile('audit.csv', typeof result.data === 'string' ? result.data : String(result.data ?? ''));
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Audit log"
        description="Unified platform actions — lifecycle, billing, impersonation, and support."
        actions={
          <button type="button" className="admin-btn admin-btn--secondary" disabled={exporting} onClick={() => void exportCsv()}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />
      <AdminSection title="Filters">
        <div className="admin-form-grid">
          <AdminField label="Tenant">
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">All tenants</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminSearch value={action} onChange={setAction} placeholder="Filter by action, e.g. impersonate" />
        </div>
      </AdminSection>
      <AdminSection title="Event stream">
        {auditQuery.isLoading ? (
          <AdminEmpty>Loading audit feed…</AdminEmpty>
        ) : (
          <div className="admin-list">
            {(auditQuery.data ?? []).map((row) => (
              <AdminListRow
                key={row.id}
                title={humanizeAction(row.action)}
                meta={
                  <>
                    {row.resource_type}
                    {row.tenant_id ? (
                      <>
                        {' · '}
                        <Link to={`/admin/tenants/${row.tenant_id}`}>{row.tenant_name || row.tenant_id}</Link>
                      </>
                    ) : null}
                    {row.actor_email ? ` · ${row.actor_email}` : ''}
                    {row.reason ? ` · ${row.reason}` : ''}
                    {` · ${formatTimestamp(row.created_at)}`}
                  </>
                }
              />
            ))}
            {(auditQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No platform audit events match these filters.</AdminEmpty>
            ) : null}
          </div>
        )}
      </AdminSection>
    </AdminPage>
  );
}

export default PlatformAuditPage;
