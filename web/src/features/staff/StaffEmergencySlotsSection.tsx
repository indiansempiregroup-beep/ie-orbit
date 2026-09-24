import React, { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { useStaffEmergencySlotMutations, useStaffEmergencySlots } from './staffAvailabilityHooks';

type Props = { staffId: string };
type ListFilter = 'upcoming' | 'past' | 'all';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function phaseOf(dateIso: string, endTime: string): 'upcoming' | 'past' {
  return new Date(`${dateIso}T${endTime}`).getTime() >= Date.now() ? 'upcoming' : 'past';
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

export function StaffEmergencySlotsSection({ staffId }: Props) {
  const { businessId } = useWorkspaceScope();
  const slotsQuery = useStaffEmergencySlots(staffId);
  const mutations = useStaffEmergencySlotMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>('upcoming');
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows = [...(slotsQuery.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    if (listFilter === 'all') return rows;
    return rows.filter((slot) => {
      const phase = phaseOf(slot.date, slot.end_time);
      return listFilter === 'past' ? phase === 'past' : phase === 'upcoming';
    });
  }, [slotsQuery.data, listFilter]);

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Emergency open slots</p>
          <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
            Add a one-off open window on top of the weekly schedule without replacing the day.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>
          Add emergency open
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['upcoming', 'past', 'all'] as ListFilter[]).map((filter) => (
          <button key={filter} type="button" onClick={() => setListFilter(filter)} style={chipStyle(listFilter === filter)}>
            {filter === 'upcoming' ? 'Upcoming' : filter === 'past' ? 'Past' : 'All'}
          </button>
        ))}
      </div>

      {slotsQuery.isLoading ? (
        <div style={{ padding: 20, textAlign: 'center' }}>Loading emergency slots…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No emergency slots in this filter.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((slot) => (
            <div
              key={slot.id}
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
                  {slot.date} · {slot.start_time} – {slot.end_time}
                </strong>
                {slot.reason ? <div style={{ color: '#6b7280', fontSize: 13 }}>{slot.reason}</div> : null}
              </div>
              <Button
                type="button"
                variant="neutral"
                disabled={mutations.remove.isPending}
                onClick={() => mutations.remove.mutate(slot.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add emergency open"
        busy={mutations.create.isPending}
        busyMessage="Saving…"
      >
        <div style={{ display: 'grid', gap: 12 }}>
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
                  capacity: 1,
                  reason: reason || undefined,
                },
                {
                  onError: (err) => setError(err.message),
                  onSuccess: () => {
                    setReason('');
                    setDialogOpen(false);
                  },
                },
              );
            }}
          >
            {mutations.create.isPending ? 'Saving…' : 'Add emergency open'}
          </Button>
          {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
        </div>
      </Dialog>
    </Card>
  );
}
