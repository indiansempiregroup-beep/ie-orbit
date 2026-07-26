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
import { useInvalidatePlatform, usePlatformTicketsQuery } from './adminHooks';

export function PlatformTicketsPage() {
  usePageMeta({ title: 'Support Tickets — Platform Admin' });
  const client = useApiClient();
  const ticketsQuery = usePlatformTicketsQuery();
  const invalidate = useInvalidatePlatform();
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Support tickets"
        description="Platform inbox for tenant support requests."
      />
      <AdminSection title="Inbox">
        <div className="admin-list">
          {(ticketsQuery.data ?? []).map((ticket) => (
            <AdminListRow
              key={ticket.id}
              title={ticket.subject}
              meta={`${ticket.requester_email || 'unknown'} · ${ticket.created_at}`}
              trailing={
                <div className="admin-action-bar" style={{ marginTop: 0 }}>
                  <AdminStatus status={ticket.status} />
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    onClick={() => setSelected(ticket.id)}
                  >
                    Add note
                  </button>
                </div>
              }
            />
          ))}
          {(ticketsQuery.data ?? []).length === 0 ? <AdminEmpty>No tickets yet.</AdminEmpty> : null}
        </div>
        {selected ? (
          <div className="admin-form-grid" style={{ marginTop: 16 }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={async () => {
                await client.platform.addTicketNote(selected, { body: note, status: 'pending' });
                setNote('');
                setSelected(null);
                invalidate();
              }}
            >
              Save note
            </button>
          </div>
        ) : null}
      </AdminSection>
    </div>
  );
}

export default PlatformTicketsPage;
