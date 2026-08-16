import React, { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { useStaffSlotBlockMutations, useStaffSlotBlocks } from './staffAvailabilityHooks';

type Props = { staffId: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function StaffSlotBlocksSection({ staffId }: Props) {
  const { businessId } = useWorkspaceScope();
  const blocksQuery = useStaffSlotBlocks(staffId);
  const mutations = useStaffSlotBlockMutations();
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Blocked slots</p>
        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
          Remove a specific available window so customers cannot book it.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          Start
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          End
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} style={fieldStyle} />
        </label>
      </div>

      <Button
        type="button"
        variant="primary"
        disabled={mutations.create.isPending}
        onClick={() => {
          setError(null);
          mutations.create.mutate(
            {
              business: businessId ?? undefined,
              staff_id: staffId,
              date,
              start_time: startTime,
              end_time: endTime,
              reason: reason || undefined,
            },
            {
              onError: (err) => setError(err.message),
              onSuccess: () => setReason(''),
            },
          );
        }}
      >
        {mutations.create.isPending ? 'Saving…' : 'Block slot'}
      </Button>
      {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}

      {blocksQuery.isLoading ? (
        <div style={{ padding: 20, textAlign: 'center' }}>Loading blocked slots…</div>
      ) : !(blocksQuery.data ?? []).length ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No blocked slots.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {(blocksQuery.data ?? []).map((block) => (
            <div
              key={block.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                borderBottom: '1px solid #eee',
                paddingBottom: 8,
              }}
            >
              <div>
                <strong>
                  {block.date} · {block.start_time} – {block.end_time}
                </strong>
                {block.reason ? <div style={{ color: '#6b7280', fontSize: 13 }}>{block.reason}</div> : null}
              </div>
              <Button
                type="button"
                variant="neutral"
                disabled={mutations.remove.isPending}
                onClick={() => mutations.remove.mutate(block.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const fieldStyle: React.CSSProperties = { padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' };
