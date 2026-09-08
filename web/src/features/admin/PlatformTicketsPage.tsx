import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import {
  AdminChip,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import { useAuth } from '../../hooks/useAuth';
import { useInvalidatePlatform, usePlatformTicketQuery, usePlatformTicketsQuery } from './adminHooks';

const STATUSES = ['open', 'pending', 'resolved'] as const;
type StatusFilter = 'all' | 'open' | 'pending' | 'resolved' | 'mine';

export function PlatformTicketsPage() {
  usePageMeta({ title: 'Support Tickets — Platform Admin' });
  const client = useApiClient();
  const auth = useAuth();
  const ticketsQuery = usePlatformTicketsQuery();
  const invalidate = useInvalidatePlatform();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const ticketQuery = usePlatformTicketQuery(selectedId);
  const ticket = ticketQuery.data;
  const myEmail = auth.user?.email?.toLowerCase() ?? '';

  const tickets = ticketsQuery.data ?? [];
  const counts = useMemo(() => {
    return {
      all: tickets.length,
      open: tickets.filter((row) => row.status === 'open').length,
      pending: tickets.filter((row) => row.status === 'pending').length,
      resolved: tickets.filter((row) => row.status === 'resolved').length,
      mine: tickets.filter((row) => row.assignee_email?.toLowerCase() === myEmail).length,
    };
  }, [tickets, myEmail]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets
      .filter((row) => {
        if (statusFilter === 'mine') return row.assignee_email?.toLowerCase() === myEmail;
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (!needle) return true;
        return [row.subject, row.requester_email, row.tenant_name, row.preview, row.assignee_email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = (status: string) => (status === 'open' ? 0 : status === 'pending' ? 1 : 2);
        const delta = rank(a.status) - rank(b.status);
        if (delta !== 0) return delta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tickets, search, statusFilter, myEmail]);

  async function saveNote() {
    if (!selectedId || !note.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.platform.addTicketNote(selectedId, { body: note.trim(), is_internal: internal });
      setNote('');
      invalidate();
      await ticketQuery.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setBusy(false);
    }
  }

  async function updateTicket(body: { status?: string; assign_to_me?: boolean; assignee_id?: string | null }) {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.platform.updateTicket(selectedId, body);
      invalidate();
      await ticketQuery.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update ticket');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Support tickets"
        description="Triage customer and owner requests, reply in the thread, and resolve the queue."
      />
      <div className="admin-kpi-grid" style={{ marginBottom: 16 }}>
        <AdminKpi label="Open" value={counts.open} hint="Needs a first reply" tone="warn" />
        <AdminKpi label="Waiting" value={counts.pending} hint="In progress" />
        <AdminKpi label="Resolved" value={counts.resolved} hint="Closed" tone="good" />
        <AdminKpi label="Assigned to me" value={counts.mine} hint="Your queue" />
      </div>
      <div className="admin-split">
        <AdminSection
          title="Inbox"
          description={`${filtered.length} of ${tickets.length}`}
          actions={
            <AdminSearch value={search} onChange={setSearch} placeholder="Search subject, email, tenant" />
          }
        >
          <div className="admin-chip-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {(
              [
                ['open', `Open (${counts.open})`],
                ['pending', `Waiting (${counts.pending})`],
                ['resolved', `Resolved (${counts.resolved})`],
                ['mine', `Mine (${counts.mine})`],
                ['all', `All (${counts.all})`],
              ] as Array<[StatusFilter, string]>
            ).map(([id, label]) => (
              <AdminChip key={id} active={statusFilter === id} onClick={() => setStatusFilter(id)}>
                {label}
              </AdminChip>
            ))}
          </div>
          {ticketsQuery.isLoading ? (
            <AdminEmpty>Loading tickets…</AdminEmpty>
          ) : (
            <div className="admin-list">
              {filtered.map((row) => (
                <AdminListRow
                  key={row.id}
                  title={row.subject}
                  meta={`${row.tenant_name || 'No tenant'} · ${row.requester_email || 'unknown'} · ${formatTimestamp(row.created_at)}${row.preview ? ` · ${row.preview}` : ''}`}
                  trailing={<AdminStatus status={row.status} />}
                  onClick={() => {
                    setSelectedId(row.id);
                    setMessage(null);
                  }}
                  style={selectedId === row.id ? { borderColor: 'var(--primary)' } : undefined}
                />
              ))}
              {filtered.length === 0 ? (
                <AdminEmpty>
                  {tickets.length ? 'No tickets match these filters.' : 'No tickets yet.'}
                </AdminEmpty>
              ) : null}
            </div>
          )}
        </AdminSection>

        <AdminSection title={ticket?.subject || 'Conversation'}>
          {!selectedId ? (
            <AdminEmpty>Select a ticket to read the thread, assign it, and reply.</AdminEmpty>
          ) : ticketQuery.isLoading ? (
            <AdminEmpty>Loading thread…</AdminEmpty>
          ) : ticket ? (
            <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
              <p className="admin-page-desc" style={{ margin: 0 }}>
                {ticket.tenant_id ? (
                  <Link to={`/admin/tenants/${ticket.tenant_id}`}>{ticket.tenant_name || ticket.tenant_slug}</Link>
                ) : (
                  'No tenant'
                )}
                {ticket.requester_email ? ` · ${ticket.requester_email}` : ''}
                {ticket.assignee_email ? ` · assigned to ${ticket.assignee_email}` : ' · unassigned'}
              </p>
              <div className="admin-action-bar" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={ticket.status === status ? 'admin-btn admin-btn--primary' : 'admin-btn admin-btn--ghost'}
                    disabled={busy || ticket.status === status}
                    onClick={() => void updateTicket({ status })}
                  >
                    {status === 'pending' ? 'waiting' : status}
                  </button>
                ))}
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={busy}
                  onClick={() => void updateTicket({ assign_to_me: true })}
                >
                  Assign to me
                </button>
                {ticket.assignee_id ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={busy}
                    onClick={() => void updateTicket({ assignee_id: null })}
                  >
                    Unassign
                  </button>
                ) : null}
              </div>
              <div className="admin-list">
                {(ticket.notes ?? []).map((item) => (
                  <article key={item.id} className={`admin-note${item.is_internal ? ' admin-note--internal' : ''}`}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.body}</p>
                    <p className="admin-list-row__meta" style={{ margin: '8px 0 0' }}>
                      {item.author_email || 'unknown'}
                      {item.is_internal ? ' · internal' : ' · visible to requester'}
                      {` · ${formatTimestamp(item.created_at)}`}
                    </p>
                  </article>
                ))}
                {(ticket.notes ?? []).length === 0 ? <AdminEmpty>No notes yet.</AdminEmpty> : null}
              </div>
              <AdminField label="Reply">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder={internal ? 'Internal note — customer will not see this' : 'Reply the customer and owner will see'}
                />
              </AdminField>
              <label className="admin-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
                Internal note
              </label>
              {message ? <p className="admin-message">{message}</p> : null}
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={busy || !note.trim()}
                onClick={() => void saveNote()}
              >
                {busy ? 'Sending…' : internal ? 'Save internal note' : 'Send reply'}
              </button>
            </div>
          ) : (
            <AdminEmpty>Ticket not found.</AdminEmpty>
          )}
        </AdminSection>
      </div>
    </AdminPage>
  );
}

export default PlatformTicketsPage;
