import { formatTimestamp } from '../../lib/datetime';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminListRow, AdminPageHeader, AdminSection } from './AdminChrome';
import { usePlatformAuditQuery } from './adminHooks';

export function PlatformAuditPage() {
  usePageMeta({ title: 'Audit — Platform Admin' });
  const auditQuery = usePlatformAuditQuery(100);

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Audit log"
        description="Unified platform actions — lifecycle, billing, impersonation, and support."
        actions={
          <a className="admin-btn admin-btn--secondary" href="/api/v1/platform/exports/audit">
            Export CSV
          </a>
        }
      />
      <AdminSection title="Event stream">
        {auditQuery.isLoading ? (
          <AdminEmpty>Loading audit feed…</AdminEmpty>
        ) : (
          <div className="admin-list">
            {(auditQuery.data ?? []).map((row) => (
              <AdminListRow
                key={row.id}
                title={row.action}
                meta={`${row.resource_type}${row.tenant_name ? ` · ${row.tenant_name}` : ''}${
                  row.actor_email ? ` · ${row.actor_email}` : ''
                }${row.reason ? ` · ${row.reason}` : ''} · ${formatTimestamp(row.created_at)}`}
              />
            ))}
            {(auditQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No platform audit events yet.</AdminEmpty>
            ) : null}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

export default PlatformAuditPage;
