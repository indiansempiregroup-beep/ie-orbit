import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlatformAuditEvent, PlatformAuditQuery } from '@ie-platform/sdk';
import { Building2, Download, FileClock, Globe2, MessageSquareText, RefreshCw } from 'lucide-react';
import { useApiClient } from '../../hooks/useApiClient';
import { useDebounce } from '../../hooks/useDebounce';
import { formatTimestamp } from '../../lib/datetime';
import { getApiErrorMessage } from '../../lib/apiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
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
  humanizeAction,
} from './AdminChrome';
import { usePlatformAuditQuery, usePlatformTenantsQuery } from './adminHooks';

const WINDOWS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All time' },
];

const CATEGORIES = [
  { value: '', label: 'All activity' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'user', label: 'Users' },
  { value: 'billing', label: 'Billing' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'support', label: 'Support' },
];

function formatMetadata(metadata?: Record<string, unknown>) {
  if (!metadata || Object.keys(metadata).length === 0) return 'No metadata recorded.';
  return JSON.stringify(metadata, null, 2);
}

export function PlatformAuditPage() {
  usePageMeta({ title: 'Audit — Platform Admin' });
  const client = useApiClient();
  const tenantsQuery = usePlatformTenantsQuery();
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [category, setCategory] = useState('');
  const [actor, setActor] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [windowDays, setWindowDays] = useState(30);
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PlatformAuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const debouncedActor = useDebounce(actor, 300);

  useEffect(() => {
    setOffset(0);
  }, [
    debouncedSearch,
    tenantId,
    action,
    category,
    debouncedActor,
    resourceType,
    windowDays,
    pageSize,
  ]);

  const filters: PlatformAuditQuery = {
    q: debouncedSearch || undefined,
    tenant_id: tenantId || undefined,
    action: action || category || undefined,
    actor: debouncedActor || undefined,
    resource_type: resourceType || undefined,
    window_days: windowDays || undefined,
    limit: pageSize,
    offset,
  };
  const auditQuery = usePlatformAuditQuery(filters);
  const result = auditQuery.data;
  const rows = result?.events ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts;
  const rangeStart = total ? offset + 1 : 0;
  const rangeEnd = Math.min(offset + pageSize, total);

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
    setError(null);
    try {
      const { limit: _limit, offset: _offset, ...exportFilters } = filters;
      const response = await client.platform.exportCsv('audit', exportFilters);
      downloadTextFile(
        `platform-audit-${new Date().toISOString().slice(0, 10)}.csv`,
        typeof response.data === 'string' ? response.data : String(response.data ?? ''),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to export audit events.'));
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setTenantId('');
    setAction('');
    setCategory('');
    setActor('');
    setResourceType('');
    setWindowDays(30);
  }

  const hasFilters = Boolean(
    debouncedSearch || tenantId || action || category || debouncedActor || resourceType || windowDays !== 30,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        title="Audit log"
        description="A searchable, immutable trail of platform administration, billing, impersonation, and support activity."
        actions={
          <>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={auditQuery.isFetching}
              onClick={() => void auditQuery.refetch()}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              <Download size={16} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Matching events"
          value={counts?.total ?? '…'}
          icon={<FileClock size={16} />}
          hint={windowDays ? `Last ${windowDays} day${windowDays === 1 ? '' : 's'}` : 'All time'}
        />
        <AdminKpi
          label="With reason"
          value={counts?.with_reason ?? '…'}
          tone="good"
          icon={<MessageSquareText size={16} />}
          hint="Admin intent recorded"
        />
        <AdminKpi
          label="Workspace scoped"
          value={counts?.tenant_scoped ?? '…'}
          icon={<Building2 size={16} />}
        />
        <AdminKpi
          label="Platform wide"
          value={counts?.global_events ?? '…'}
          icon={<Globe2 size={16} />}
        />
      </div>

      <AdminSection
        title="Event stream"
        description={total ? `Showing ${rangeStart}–${rangeEnd} of ${total} events` : 'No matching events'}
        actions={
          hasFilters ? (
            <button type="button" className="admin-btn admin-btn--ghost" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null
        }
      >
        <div className="admin-toolbar">
          <AdminSearch
            value={search}
            onChange={setSearch}
            placeholder="Search action, reason, resource, actor, or workspace"
          />
          <div className="admin-chip-row">
            {WINDOWS.map((item) => (
              <AdminChip
                key={item.label}
                active={windowDays === item.value}
                onClick={() => setWindowDays(item.value)}
              >
                {item.label}
              </AdminChip>
            ))}
          </div>
        </div>

        <div className="admin-chip-row" style={{ marginBottom: 14 }}>
          {CATEGORIES.map((item) => (
            <AdminChip
              key={item.label}
              active={category === item.value && !action}
              onClick={() => {
                setCategory(item.value);
                setAction('');
              }}
            >
              {item.label}
            </AdminChip>
          ))}
        </div>

        <div className="admin-filter-row">
          <AdminField label="Workspace">
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">All workspaces</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Action">
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setCategory('');
              }}
            >
              <option value="">All actions</option>
              {(result?.actions ?? []).map((value) => (
                <option key={value} value={value}>
                  {humanizeAction(value)}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Resource">
            <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
              <option value="">All resources</option>
              {(result?.resource_types ?? []).map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Actor email">
            <input
              className="admin-inline-input"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              placeholder="admin@example.com"
            />
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

        {error ? <p className="admin-message admin-message--error">{error}</p> : null}

        {auditQuery.isLoading ? (
          <AdminEmpty>Loading audit events…</AdminEmpty>
        ) : auditQuery.error ? (
          <AdminEmpty title="Audit log unavailable">
            {getApiErrorMessage(auditQuery.error, 'Unable to load audit events.')}
          </AdminEmpty>
        ) : rows.length === 0 ? (
          <AdminEmpty
            title="No matching audit events"
            action={
              hasFilters ? (
                <button type="button" className="admin-btn admin-btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
          >
            Try a broader time range or remove one of the filters.
          </AdminEmpty>
        ) : (
          <>
            <div className={auditQuery.isFetching ? 'admin-table-loading' : undefined}>
              <AdminTable columns={['When', 'Action', 'Actor', 'Workspace', 'Resource', 'Reason', '']}>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="admin-table__muted">{formatTimestamp(row.created_at)}</td>
                    <td>
                      <button type="button" className="admin-table-link" onClick={() => setSelected(row)}>
                        {humanizeAction(row.action)}
                      </button>
                      <div className="admin-table__muted">{row.action}</div>
                    </td>
                    <td>{row.actor_email || <span className="admin-table__muted">System</span>}</td>
                    <td>
                      {row.tenant_id ? (
                        <Link to={`/admin/tenants/${row.tenant_id}`}>
                          {row.tenant_name || row.tenant_id}
                        </Link>
                      ) : (
                        <span className="admin-tag">Platform wide</span>
                      )}
                    </td>
                    <td>
                      {row.resource_type.replace(/_/g, ' ')}
                      {row.resource_id ? <div className="admin-table__muted">{row.resource_id}</div> : null}
                    </td>
                    <td>
                      <span className="admin-reason-preview">{row.reason || 'No reason recorded'}</span>
                    </td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => setSelected(row)}
                      >
                        Inspect
                      </button>
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
        open={Boolean(selected)}
        title={selected ? humanizeAction(selected.action) : 'Audit event'}
        description={selected?.action}
        onClose={() => setSelected(null)}
        wide
      >
        {selected ? (
          <div className="admin-detail-grid">
            <dl className="admin-detail-list admin-detail-list--columns">
              <div>
                <dt>Occurred</dt>
                <dd>{formatTimestamp(selected.created_at)}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{selected.actor_email || 'System'}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{selected.tenant_name || 'Platform wide'}</dd>
              </div>
              <div>
                <dt>IP address</dt>
                <dd>{selected.ip_address || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Resource type</dt>
                <dd>{selected.resource_type || '—'}</dd>
              </div>
              <div>
                <dt>Resource ID</dt>
                <dd>{selected.resource_id || '—'}</dd>
              </div>
              <div className="admin-detail-list__wide">
                <dt>Reason</dt>
                <dd>{selected.reason || 'No reason recorded.'}</dd>
              </div>
              <div className="admin-detail-list__wide">
                <dt>User agent</dt>
                <dd className="admin-code-block">{selected.user_agent || 'Not recorded.'}</dd>
              </div>
              <div className="admin-detail-list__wide">
                <dt>Metadata</dt>
                <dd>
                  <pre className="admin-code-block">{formatMetadata(selected.metadata)}</pre>
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformAuditPage;
