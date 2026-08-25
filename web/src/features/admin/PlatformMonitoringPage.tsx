import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BillingWebhookEvent } from '@ie-orbit/sdk';
import {
  Activity,
  CheckCircle2,
  Clock3,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useDebounce } from '../../hooks/useDebounce';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import { getApiErrorMessage } from '../../lib/apiClient';
import {
  useBillingPlatformMonitoringQuery,
  useBillingPlatformWebhookEventsQuery,
} from '../settings/billingHooks';
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
  AdminStatus,
  AdminTable,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';

const WINDOWS = [
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 24 * 7, label: '7d' },
  { hours: 24 * 30, label: '30d' },
];

const STATUSES = [
  { value: '', label: 'Problems' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead_letter', label: 'Dead-letter' },
  { value: 'received', label: 'Received' },
  { value: 'processed', label: 'Processed' },
  { value: 'ignored', label: 'Ignored' },
];

export function PlatformMonitoringPage() {
  usePageMeta({ title: 'Monitoring — Platform Admin' });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const tenantsQuery = usePlatformTenantsQuery();
  const [windowHours, setWindowHours] = useState(24);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [provider, setProvider] = useState('');
  const [eventType, setEventType] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selected, setSelected] = useState<BillingWebhookEvent | null>(null);
  const [bulkScope, setBulkScope] = useState<'failed' | 'dead_letter' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setOffset(0);
  }, [windowHours, status, debouncedSearch, tenantId, provider, eventType, pageSize]);

  const monitoringQuery = useBillingPlatformMonitoringQuery(windowHours, true);
  const eventsQuery = useBillingPlatformWebhookEventsQuery(
    {
      windowHours,
      status,
      query: debouncedSearch,
      tenantId,
      provider,
      eventType,
      limit: pageSize,
      offset,
    },
    true,
  );

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void Promise.all([monitoringQuery.refetch(), eventsQuery.refetch()]);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, monitoringQuery.refetch, eventsQuery.refetch]);

  const summary = monitoringQuery.data;
  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const failed = summary?.failed_events ?? 0;
  const deadLetter = summary?.dead_letter_events ?? 0;
  const overdue = summary?.overdue_retries ?? 0;
  const healthy = failed === 0 && deadLetter === 0 && overdue === 0;
  const rangeStart = total ? offset + 1 : 0;
  const rangeEnd = Math.min(offset + pageSize, total);

  async function refresh() {
    setError(null);
    try {
      await Promise.all([monitoringQuery.refetch(), eventsQuery.refetch()]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to refresh monitoring data.'));
    }
  }

  async function reprocessOne(event: BillingWebhookEvent) {
    setBusy(event.id);
    setMessage(null);
    setError(null);
    try {
      const result = await client.billing.platformReprocessWebhookEvent(event.id, {
        reason: `manual recovery for ${event.external_event_id}`,
      });
      setMessage(
        result.data.reprocessed
          ? `${event.external_event_id} was reprocessed successfully.`
          : result.data.error || 'Reprocess did not succeed.',
      );
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to reprocess event.'));
    } finally {
      setBusy(null);
    }
  }

  async function reprocessBulk() {
    if (!bulkScope) return;
    const scope = bulkScope;
    setBusy(`bulk:${scope}`);
    setMessage(null);
    setError(null);
    try {
      const result = await client.billing.platformReprocessWebhookEventsBulk({
        scope,
        limit: 50,
        confirm: true,
        window_hours: windowHours,
        tenant_id: tenantId || undefined,
        provider: provider || undefined,
        event_type: eventType || undefined,
        q: debouncedSearch || undefined,
        reason: `bulk recovery for filtered ${scope.replace('_', ' ')} webhook backlog`,
      });
      setMessage(
        `${result.data.processed} processed, ${result.data.failed} failed from ${result.data.selected} selected ${scope.replace('_', ' ')} events.`,
      );
      setBulkScope(null);
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Bulk reprocess failed.'));
    } finally {
      setBusy(null);
    }
  }

  function clearFilters() {
    setSearch('');
    setTenantId('');
    setProvider('');
    setEventType('');
    setStatus('');
  }

  const hasFilters = Boolean(debouncedSearch || tenantId || provider || eventType || status);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Monitoring"
        description="Watch billing webhook health across every workspace, investigate failures, and safely drain retry backlogs."
        actions={
          <>
            <button
              type="button"
              className={`admin-btn ${autoRefresh ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
              onClick={() => setAutoRefresh((value) => !value)}
            >
              <Activity size={16} />
              {autoRefresh ? 'Live · 30s' : 'Auto-refresh'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={monitoringQuery.isFetching || eventsQuery.isFetching}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </>
        }
      />

      <div className={`admin-health-banner admin-health-banner--${healthy ? 'good' : 'danger'}`}>
        <span className="admin-health-banner__icon">
          {healthy ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}
        </span>
        <div>
          <strong>{healthy ? 'Webhook processing is healthy' : 'Webhook processing needs attention'}</strong>
          <p>
            {healthy
              ? `No unresolved failures in the last ${windowHours} hours.`
              : `${failed} failed, ${deadLetter} dead-letter, and ${overdue} overdue retr${overdue === 1 ? 'y' : 'ies'} in this window.`}
          </p>
        </div>
        <div className="admin-chip-row">
          {WINDOWS.map((item) => (
            <AdminChip
              key={item.hours}
              active={windowHours === item.hours}
              onClick={() => setWindowHours(item.hours)}
            >
              {item.label}
            </AdminChip>
          ))}
        </div>
      </div>

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Success rate"
          value={summary ? `${summary.success_rate.toFixed(1)}%` : '…'}
          tone={(summary?.success_rate ?? 100) >= 99 ? 'good' : 'warn'}
          hint={`${summary?.processed_events ?? 0} of ${summary?.total_events ?? 0} processed`}
          icon={<CheckCircle2 size={16} />}
        />
        <AdminKpi
          label="Failed"
          value={summary?.failed_events ?? '…'}
          tone={failed > 0 ? 'danger' : 'good'}
          icon={<XCircle size={16} />}
        />
        <AdminKpi
          label="Dead-letter"
          value={summary?.dead_letter_events ?? '…'}
          tone={deadLetter > 0 ? 'danger' : 'good'}
          icon={<TriangleAlert size={16} />}
        />
        <AdminKpi
          label="Overdue retries"
          value={summary?.overdue_retries ?? '…'}
          tone={overdue > 0 ? 'warn' : 'good'}
          hint={`${summary?.scheduled_retries ?? 0} scheduled`}
          icon={<Clock3 size={16} />}
        />
        <AdminKpi
          label="Workspaces impacted"
          value={summary?.tenants_impacted ?? '…'}
          tone={(summary?.tenants_impacted ?? 0) > 0 ? 'warn' : 'default'}
        />
        <AdminKpi
          label="Recovery runs"
          value={summary?.reprocess_actions ?? '…'}
          hint={`${summary?.reconciliation_runs ?? 0} reconciliations`}
          icon={<RotateCcw size={16} />}
        />
      </div>

      <AdminSection
        title="Webhook events"
        description={total ? `Showing ${rangeStart}–${rangeEnd} of ${total} events` : 'No matching events'}
        actions={
          <div className="admin-action-bar" style={{ marginTop: 0 }}>
            {hasFilters ? (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={Boolean(busy) || failed === 0}
              onClick={() => setBulkScope('failed')}
            >
              Reprocess failed
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={Boolean(busy) || deadLetter === 0}
              onClick={() => setBulkScope('dead_letter')}
            >
              Reprocess dead-letter
            </button>
          </div>
        }
      >
        <div className="admin-toolbar">
          <AdminSearch
            value={search}
            onChange={setSearch}
            placeholder="Search event ID, type, error, or workspace"
          />
          <div className="admin-chip-row">
            {STATUSES.map((item) => (
              <AdminChip
                key={item.value || 'problem'}
                active={status === item.value}
                onClick={() => setStatus(item.value)}
              >
                {item.label}
              </AdminChip>
            ))}
          </div>
        </div>

        <div className="admin-filter-row">
          <AdminField label="Workspace">
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">All workspaces</option>
              {(tenantsQuery.data ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.display_name || tenant.slug}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Provider">
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">All providers</option>
              {(eventsQuery.data?.providers ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Event type">
            <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              <option value="">All event types</option>
              {(eventsQuery.data?.event_types ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
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

        {message ? <p className="admin-message admin-message--ok">{message}</p> : null}
        {error ? <p className="admin-message admin-message--error">{error}</p> : null}

        {eventsQuery.isLoading ? (
          <AdminEmpty>Loading webhook events…</AdminEmpty>
        ) : eventsQuery.error ? (
          <AdminEmpty title="Monitoring data unavailable">
            {getApiErrorMessage(eventsQuery.error, 'Unable to load webhook events.')}
          </AdminEmpty>
        ) : events.length === 0 ? (
          <AdminEmpty
            title={hasFilters ? 'No matching events' : 'No problem events'}
            action={
              hasFilters ? (
                <button type="button" className="admin-btn admin-btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
          >
            {hasFilters
              ? 'Try a broader search or remove one of the filters.'
              : 'Webhook failures in this window will appear here.'}
          </AdminEmpty>
        ) : (
          <>
            <div className={eventsQuery.isFetching ? 'admin-table-loading' : undefined}>
              <AdminTable columns={['When', 'Workspace', 'Event', 'Provider', 'Status', 'Retries', 'Error', '']}>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="admin-table__muted">{formatTimestamp(event.created_at)}</td>
                    <td>
                      {event.tenant_id ? (
                        <Link to={`/admin/tenants/${event.tenant_id}`}>
                          {event.tenant_name || event.tenant_slug}
                        </Link>
                      ) : (
                        event.tenant_name || 'Global'
                      )}
                    </td>
                    <td>
                      <button type="button" className="admin-table-link" onClick={() => setSelected(event)}>
                        {event.event_type}
                      </button>
                      <div className="admin-table__muted">{event.external_event_id}</div>
                    </td>
                    <td>{event.provider}</td>
                    <td>
                      <AdminStatus status={event.status} />
                    </td>
                    <td>
                      {event.retry_count ?? 0}
                      {event.next_retry_at ? (
                        <div className="admin-table__muted">Next {formatTimestamp(event.next_retry_at)}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className="admin-error-preview">{event.error_message || '—'}</span>
                    </td>
                    <td className="admin-table__actions">
                      {event.status === 'failed' || event.status === 'dead_letter' ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={Boolean(busy)}
                          onClick={() => void reprocessOne(event)}
                        >
                          {busy === event.id ? 'Working…' : 'Reprocess'}
                        </button>
                      ) : null}
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
        title={selected?.event_type || 'Webhook event'}
        description={selected?.external_event_id}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="admin-detail-grid">
            <AdminStatus status={selected.status} />
            <dl className="admin-detail-list">
              <div>
                <dt>Workspace</dt>
                <dd>{selected.tenant_name || selected.tenant_slug || 'Global'}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{selected.provider}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{formatTimestamp(selected.created_at)}</dd>
              </div>
              <div>
                <dt>Processed</dt>
                <dd>{formatTimestamp(selected.processed_at)}</dd>
              </div>
              <div>
                <dt>Retries</dt>
                <dd>{selected.retry_count ?? 0}</dd>
              </div>
              <div>
                <dt>Next retry</dt>
                <dd>{formatTimestamp(selected.next_retry_at)}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd className="admin-code-block">{selected.error_message || 'No error recorded.'}</dd>
              </div>
            </dl>
            {selected.status === 'failed' || selected.status === 'dead_letter' ? (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={Boolean(busy)}
                onClick={() => void reprocessOne(selected)}
              >
                {busy === selected.id ? 'Reprocessing…' : 'Reprocess event'}
              </button>
            ) : null}
          </div>
        ) : null}
      </AdminDrawer>

      <AdminDrawer
        open={Boolean(bulkScope)}
        variant="sheet"
        title={`Reprocess ${bulkScope?.replace('_', ' ') || ''} events?`}
        description="This retries up to 50 oldest events matching the current time window and filters. A platform audit entry will be created."
        onClose={() => {
          if (!busy) setBulkScope(null);
        }}
        footer={
          <div className="admin-action-bar" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={Boolean(busy)}
              onClick={() => setBulkScope(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={Boolean(busy)}
              onClick={() => void reprocessBulk()}
            >
              {busy ? 'Reprocessing…' : 'Confirm reprocess'}
            </button>
          </div>
        }
      >
        <div className="admin-banner">
          <div>
            <strong>Recovery operation</strong>
            <p>Review the event filters first. Reprocessing may trigger provider-side state updates.</p>
          </div>
        </div>
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformMonitoringPage;
