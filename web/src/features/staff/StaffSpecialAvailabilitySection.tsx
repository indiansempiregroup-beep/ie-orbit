import React, { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { formatTimestamp } from '../../lib/datetime';
import {
  useStaffSpecialAvailability,
  useStaffSpecialAvailabilityMutations,
} from './staffAvailabilityHooks';

type StaffSpecialAvailabilitySectionProps = {
  staffId: string;
};

function toLocalInput(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function StaffSpecialAvailabilitySection({ staffId }: StaffSpecialAvailabilitySectionProps) {
  const { businessId } = useWorkspaceScope();
  const specialQuery = useStaffSpecialAvailability(staffId);
  const mutations = useStaffSpecialAvailabilityMutations();
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const end = new Date();
    end.setHours(end.getHours() + 3);
    return toLocalInput(end);
  });
  const [capacity, setCapacity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Special availability</p>
        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
          One-off open windows for a date. When present, these override the weekly schedule for that day.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          Starts
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          Ends
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          Capacity
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }} />
        </label>
      </div>
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
                specialQuery.refetch();
              },
              onError: (err) => setError(err.message),
            },
          );
        }}
      >
        {mutations.create.isPending ? 'Adding…' : 'Add special window'}
      </Button>

      <div style={{ display: 'grid', gap: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {specialQuery.isLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}>Loading special availability…</div>
        ) : (specialQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No special availability windows.</div>
        ) : (
          (specialQuery.data ?? []).map((row) => (
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
                <div>{formatTimestamp(row.starts_at)} – {formatTimestamp(row.ends_at)}</div>
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
      {error ? <div style={{ color: '#dc2626' }}>{error}</div> : null}
    </Card>
  );
}
