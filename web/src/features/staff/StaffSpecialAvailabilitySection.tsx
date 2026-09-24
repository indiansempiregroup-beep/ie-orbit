import React, { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { formatTimestamp } from '../../lib/datetime';
import {
  useStaffSpecialAvailability,
  useStaffSpecialAvailabilityMutations,
} from './staffAvailabilityHooks';

type StaffSpecialAvailabilitySectionProps = {
  staffId: string;
};

type ListFilter = 'upcoming' | 'past' | 'all';

function toLocalInput(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function phaseOf(startsAt: string, endsAt: string): 'upcoming' | 'past' {
  return new Date(endsAt).getTime() >= Date.now() ? 'upcoming' : 'past';
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 999,
  border: active ? '1px solid #1A56DB' : '1px solid #e5e7eb',
  background: active ? '#1A56DB' : '#fff',
  color: active ? '#fff' : '#111827',
  cursor: 'pointer',
});

const fieldStyle: React.CSSProperties = { padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' };

export function StaffSpecialAvailabilitySection({ staffId }: StaffSpecialAvailabilitySectionProps) {
  const { businessId } = useWorkspaceScope();
  const specialQuery = useStaffSpecialAvailability(staffId);
  const mutations = useStaffSpecialAvailabilityMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>('upcoming');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const end = new Date();
    end.setHours(end.getHours() + 3);
    return toLocalInput(end);
  });
  const [capacity, setCapacity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows = [...(specialQuery.data ?? [])].sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
    if (listFilter === 'all') return rows;
    return rows.filter((row) => {
      const phase = phaseOf(row.starts_at, row.ends_at);
      return listFilter === 'past' ? phase === 'past' : phase === 'upcoming';
    });
  }, [specialQuery.data, listFilter]);

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Extra hours</p>
          <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
            One-off open windows for a date. When present, these override the weekly schedule for that day.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>
          Add extra hours
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['upcoming', 'past', 'all'] as ListFilter[]).map((filter) => (
          <button key={filter} type="button" onClick={() => setListFilter(filter)} style={chipStyle(listFilter === filter)}>
            {filter === 'upcoming' ? 'Upcoming' : filter === 'past' ? 'Past' : 'All'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {specialQuery.isLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}>Loading special availability…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No extra hours in this filter.</div>
        ) : (
          filtered.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr auto',
                gap: 12,
                padding: '12px 16px',
                background: '#fff',
                alignItems: 'center',
              }}
            >
              <div>
                <div>
                  {formatTimestamp(row.starts_at)} – {formatTimestamp(row.ends_at)}
                </div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{row.reason || 'Special hours'}</div>
              </div>
              <span>Capacity {row.capacity ?? 1}</span>
              <Button
                type="button"
                variant="neutral"
                disabled={mutations.remove.isPending}
                onClick={() => mutations.remove.mutate(row.id, { onSuccess: () => specialQuery.refetch() })}
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add extra hours"
        busy={mutations.create.isPending}
        busyMessage="Adding…"
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            Starts
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Ends
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Capacity
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={fieldStyle} />
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={mutations.create.isPending || !businessId}
            onClick={() => {
              setError(null);
              mutations.create.mutate(
                {
                  business: businessId ?? undefined,
                  staff_id: staffId,
                  starts_at: new Date(startsAt).toISOString(),
                  ends_at: new Date(endsAt).toISOString(),
                  capacity,
                  reason,
                },
                {
                  onSuccess: () => {
                    setReason('');
                    setDialogOpen(false);
                    specialQuery.refetch();
                  },
                  onError: (err) => setError(err.message),
                },
              );
            }}
          >
            {mutations.create.isPending ? 'Adding…' : 'Add special window'}
          </Button>
          {error ? <div style={{ color: '#dc2626' }}>{error}</div> : null}
        </div>
      </Dialog>
    </Card>
  );
}
