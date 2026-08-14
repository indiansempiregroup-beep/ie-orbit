import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import { getApiErrorMessage } from '../../lib/apiClient';
import {
  useBillingPlatformMonitoringQuery,
  useBillingPlatformWebhookEventsQuery,
} from '../settings/billingHooks';
import {
  AdminChip,
  AdminEmpty,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  AdminTable,
} from './AdminChrome';

const WINDOWS = [
  { hours: 24, label: '24h' },
  { hours: 24 * 7, label: '7d' },
  { hours: 24 * 30, label: '30d' },
];

const STATUSES = [
  { value: '', label: 'Failed + dead-letter' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead_letter', label: 'Dead-letter' },
];

export function PlatformMonitoringPage() {
  usePageMeta({ title: 'Monitoring — Platform Admin' });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [windowHours, setWindowHours] = useState(24);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const monitoringQuery = useBillingPlatformMonitoringQuery(windowHours, true);
  const eventsQuery = useBillingPlatformWebhookEventsQuery(windowHours, status || undefined, true);
  const failed = monitoringQuery.data?.failed_events ?? 0;
  const events = eventsQuery.data?.events ?? [];

  async function refresh() {
    await Promise.all([monitoringQuery.refetch(), eventsQuery.refetch()]);
  }

  async function reprocessOne(eventId: string) {
    setBusy(eventId);
    setMessage(null);
    try {
      const result = await client.billing.platformReprocessWebhookEvent(eventId);
      setMessage(result.data.reprocessed ? 'Event reprocessed.' : result.data.error || 'Reprocess did not succeed.');
      await refresh();
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Unable to reprocess event.'));
    } finally {
      setBusy(null);
    }
  }

  async function reprocessBulk(scope: 'failed' | 'dead_letter') {
    setBusy(`bulk:${scope}`);
    setMessage(null);
    try {
      const result = await client.billing.platformReprocessWebhookEventsBulk({
        scope,
        limit: 50,
        confirm: true,
      });
      setMessage(
        `Bulk ${scope}: ${result.data.processed} processed, ${result.data.failed} failed of ${result.data.selected} selected.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
      await refresh();
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Bulk reprocess failed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Monitoring"
        description="Webhook failures and dead-letter events across all tenants."
        actions={
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
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Failed events"
          value={monitoringQuery.data?.failed_events ?? '…'}
          tone={failed > 0 ? 'danger' : 'good'}
          hint={`Last ${windowHours} hours`}
        />
        <AdminKpi
          label="Dead-letter"
          value={monitoringQuery.data?.dead_letter_events ?? '…'}
          tone={(monitoringQuery.data?.dead_letter_events ?? 0) > 0 ? 'warn' : 'default'}
        />
        <AdminKpi label="Reprocess actions" value={monitoringQuery.data?.reprocess_actions ?? '…'} />
        <AdminKpi label="Tenants impacted" value={monitoringQuery.data?.tenants_impacted ?? '…'} />
      </div>

      <AdminSection
        title="Problem events"
        description="Reprocess a single event, or drain the failed / dead-letter backlog."
        actions={
          <div className="admin-action-bar" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={Boolean(busy)}
              onClick={() => void reprocessBulk('failed')}
            >
              {busy === 'bulk:failed' ? 'Reprocessing…' : 'Reprocess failed'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={Boolean(busy)}
              onClick={() => void reprocessBulk('dead_letter')}
            >
              {busy === 'bulk:dead_letter' ? 'Reprocessing…' : 'Reprocess dead-letter'}
            </button>
          </div>
        }
      >
        <div className="admin-chip-row" style={{ marginBottom: 12 }}>
          {STATUSES.map((item) => (
            <AdminChip key={item.value || 'problem'} active={status === item.value} onClick={() => setStatus(item.value)}>
              {item.label}
            </AdminChip>
          ))}
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
        {eventsQuery.isLoading ? (
          <AdminEmpty>Loading webhook events…</AdminEmpty>
        ) : events.length === 0 ? (
          <AdminEmpty title="No problem events">Webhook failures in this window will appear here.</AdminEmpty>
        ) : (
          <AdminTable columns={['When', 'Tenant', 'Event', 'Status', 'Retries', 'Error', '']}>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="admin-table__muted">{formatTimestamp(event.created_at)}</td>
                <td>
                  {event.tenant_id ? (
                    <Link to={`/admin/tenants/${event.tenant_id}`}>{event.tenant_name || event.tenant_slug}</Link>
                  ) : (
                    event.tenant_name || '—'
                  )}
                </td>
                <td>
                  {event.event_type}
                  <div className="admin-table__muted">{event.external_event_id}</div>
                </td>
                <td>
                  <AdminStatus status={event.status} />
                </td>
                <td>{event.retry_count ?? 0}</td>
                <td className="admin-table__muted">{event.error_message || '—'}</td>
                <td>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={Boolean(busy)}
                    onClick={() => void reprocessOne(event.id)}
                  >
                    {busy === event.id ? '…' : 'Reprocess'}
                  </button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminSection>
    </AdminPage>
  );
}

export default PlatformMonitoringPage;
