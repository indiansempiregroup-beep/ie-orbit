import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import {
  AdminEmpty,
  AdminField,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformTicketQuery, usePlatformTicketsQuery } from './adminHooks';

const STATUSES = ['open', 'pending', 'resolved'] as const;

export function PlatformTicketsPage() {
  usePageMeta({ title: 'Support Tickets — Platform Admin' });
  const client = useApiClient();
  const ticketsQuery = usePlatformTicketsQuery();
  const invalidate = useInvalidatePlatform();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ticketQuery = usePlatformTicketQuery(selectedId);
  const ticket = ticketQuery.data;

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
        description="Open a ticket to read the thread, assign it, and resolve it."
      />
      <div className="admin-split">
        <AdminSection title="Inbox">
          {ticketsQuery.isLoading ? (
            <AdminEmpty>Loading tickets…</AdminEmpty>
          ) : (
            <div className="admin-list">
              {(ticketsQuery.data ?? []).map((row) => (
                <AdminListRow
                  key={row.id}
                  title={row.subject}
                  meta={`${row.tenant_name || 'No tenant'} · ${row.requester_email || 'unknown'} · ${formatTimestamp(row.created_at)}`}
                  trailing={<AdminStatus status={row.status} />}
                  onClick={() => {
                    setSelectedId(row.id);
                    setMessage(null);
                  }}
                  style={selectedId === row.id ? { borderColor: 'var(--primary)' } : undefined}
                />
              ))}
              {(ticketsQuery.data ?? []).length === 0 ? <AdminEmpty>No tickets yet.</AdminEmpty> : null}
            </div>
          )}
        </AdminSection>

        <AdminSection title={ticket?.subject || 'Conversation'}>
          {!selectedId ? (
            <AdminEmpty>Select a ticket to read notes and change status.</AdminEmpty>
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
                    {status}
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
              <AdminField label="Add a note">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
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
                {busy ? 'Saving…' : 'Save note'}
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
