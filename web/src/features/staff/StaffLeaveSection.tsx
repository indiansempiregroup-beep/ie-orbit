import React, { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { formatTimestamp } from '../../lib/datetime';
import { useStaffLeaveMutations, useStaffLeaves } from './staffAvailabilityHooks';
import { useStaffWeeklySchedules } from './staffScheduleHooks';

type StaffLeaveSectionProps = {
  staffId: string;
};

type LeaveDayKind = 'full_day' | 'half_day';
type HalfDayPart = 'first' | 'second';
type ListFilter = 'upcoming' | 'past' | 'all';

function toIsoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseClock(value: string | undefined, fallbackHours: number, fallbackMinutes = 0) {
  if (!value) return { hours: fallbackHours, minutes: fallbackMinutes };
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return { hours: fallbackHours, minutes: fallbackMinutes };
  }
  return { hours, minutes };
}

function midpoint(
  start: { hours: number; minutes: number },
  end: { hours: number; minutes: number },
) {
  const startMins = start.hours * 60 + start.minutes;
  const endMins = end.hours * 60 + end.minutes;
  const mid = Math.floor((startMins + endMins) / 2);
  return { hours: Math.floor(mid / 60), minutes: mid % 60 };
}

function leaveWindowForDay(
  isoDate: string,
  kind: LeaveDayKind,
  schedules: Array<{ weekday: number; shift_start?: string; shift_end?: string; is_available?: boolean }>,
  halfDayPart: HalfDayPart = 'first',
) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  const weekday = (jsDay + 6) % 7;
  const schedule = schedules.find((row) => row.weekday === weekday && row.is_available !== false);
  const start = parseClock(schedule?.shift_start, 9);
  const end = parseClock(schedule?.shift_end, 18);
  const mid = midpoint(start, end);

  if (kind === 'half_day') {
    if (halfDayPart === 'second') {
      const startDate = new Date(year, month - 1, day, mid.hours, mid.minutes, 0, 0);
      const endDate = new Date(year, month - 1, day, end.hours, end.minutes, 0, 0);
      return { starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), leave_type: 'half_day_second' };
    }
    const startDate = new Date(year, month - 1, day, start.hours, start.minutes, 0, 0);
    const endDate = new Date(year, month - 1, day, mid.hours, mid.minutes, 0, 0);
    return { starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), leave_type: 'half_day_first' };
  }

  const startDate = new Date(year, month - 1, day, start.hours, start.minutes, 0, 0);
  const endDate = new Date(year, month - 1, day, end.hours, end.minutes, 0, 0);
  return { starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), leave_type: 'full_day' };
}

function formatLeaveKind(leaveType: string | undefined) {
  if (leaveType === 'half_day' || leaveType === 'half_day_first') return 'Half day (first half)';
  if (leaveType === 'half_day_second') return 'Half day (second half)';
  if (leaveType === 'full_day') return 'Full day';
  return leaveType || 'Leave';
}

function leavePhase(startsAt: string, endsAt: string): 'active' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= start && now <= end) return 'active';
  if (start > now) return 'upcoming';
  return 'past';
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 999,
  border: active ? '1px solid #1A56DB' : '1px solid #e5e7eb',
  background: active ? '#1A56DB' : '#fff',
  color: active ? '#fff' : '#111827',
  cursor: 'pointer',
});

export function StaffLeaveSection({ staffId }: StaffLeaveSectionProps) {
  const { businessId } = useWorkspaceScope();
  const leavesQuery = useStaffLeaves(staffId);
  const schedulesQuery = useStaffWeeklySchedules(staffId);
  const mutations = useStaffLeaveMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>('upcoming');
  const [selectedDays, setSelectedDays] = useState<string[]>(() => [toIsoDate(new Date())]);
  const [leaveKind, setLeaveKind] = useState<LeaveDayKind>('full_day');
  const [halfDayPart, setHalfDayPart] = useState<HalfDayPart>('first');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const mondayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const cells: Array<{ day: number | null; iso?: string }> = [];
    for (let i = 0; i < mondayOffset; i += 1) cells.push({ day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, iso: toIsoDate(new Date(year, monthIndex, day)) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [month]);

  const today = toIsoDate(new Date());
  const selectedSet = new Set(selectedDays);

  const filteredLeaves = useMemo(() => {
    const rows = [...(leavesQuery.data ?? [])].sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
    if (listFilter === 'all') return rows;
    return rows.filter((leave) => {
      const phase = leavePhase(leave.starts_at, leave.ends_at);
      if (listFilter === 'past') return phase === 'past';
      return phase !== 'past';
    });
  }, [leavesQuery.data, listFilter]);

  function toggleDay(iso: string) {
    if (iso < today) return;
    setSelectedDays((current) => {
      if (current.includes(iso)) return current.filter((day) => day !== iso);
      return [...current, iso].sort();
    });
  }

  function resetForm() {
    setReason('');
    setSelectedDays([today]);
    setLeaveKind('full_day');
    setHalfDayPart('first');
    setError(null);
  }

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Leave</p>
          <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
            Leave blocks overlapping booking slots for selected days.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>
          Add leave
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
        {leavesQuery.isLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}>Loading leave…</div>
        ) : filteredLeaves.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No leave in this filter.</div>
        ) : (
          filteredLeaves.map((leave) => {
            const phase = leavePhase(leave.starts_at, leave.ends_at);
            const phaseLabel = phase === 'active' ? 'Active now' : phase === 'upcoming' ? 'Upcoming' : 'Past';
            return (
              <div
                key={leave.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto',
                  gap: 12,
                  padding: '12px 16px',
                  background: '#fff',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div>
                    {formatTimestamp(leave.starts_at)} – {formatTimestamp(leave.ends_at)}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>
                    {formatLeaveKind(leave.leave_type)}
                    {leave.reason ? ` · ${leave.reason}` : ''}
                  </div>
                </div>
                <span>{phaseLabel}</span>
                <span>{leave.approved ? 'Approved' : 'Pending'}</span>
                <Button
                  type="button"
                  variant="neutral"
                  disabled={mutations.remove.isPending}
                  onClick={() => mutations.remove.mutate(leave.id, { onSuccess: () => leavesQuery.refetch() })}
                >
                  Delete
                </Button>
              </div>
            );
          })
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          resetForm();
        }}
        title="Add leave"
        busy={mutations.create.isPending}
        busyMessage="Adding leave…"
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                ‹
              </button>
              <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                ›
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
                <div key={label} style={{ textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {calendarDays.map((cell, index) => {
                if (!cell.day || !cell.iso) return <div key={`empty-${index}`} />;
                const selected = selectedSet.has(cell.iso);
                const past = cell.iso < today;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={past}
                    onClick={() => toggleDay(cell.iso!)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 999,
                      border: selected ? 'none' : '1px solid #e5e7eb',
                      background: selected ? '#1A56DB' : '#fff',
                      color: selected ? '#fff' : past ? '#94a3b8' : '#111827',
                      cursor: past ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>
              {selectedDays.length === 0
                ? 'No days selected'
                : `${selectedDays.length} day${selectedDays.length === 1 ? '' : 's'} selected`}
            </span>
            <button type="button" onClick={() => setLeaveKind('half_day')} style={chipStyle(leaveKind === 'half_day')}>
              Half day
            </button>
            <button type="button" onClick={() => setLeaveKind('full_day')} style={chipStyle(leaveKind === 'full_day')}>
              Full day
            </button>
          </div>

          {leaveKind === 'half_day' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setHalfDayPart('first')} style={chipStyle(halfDayPart === 'first')}>
                First half
              </button>
              <button type="button" onClick={() => setHalfDayPart('second')} style={chipStyle(halfDayPart === 'second')}>
                Second half
              </button>
            </div>
          ) : null}

          <label style={{ display: 'grid', gap: 6 }}>
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>

          <Button
            type="button"
            variant="primary"
            disabled={mutations.create.isPending || !businessId || selectedDays.length === 0}
            onClick={() => {
              setError(null);
              const schedules = schedulesQuery.data ?? [];
              Promise.all(
                selectedDays.map((day) => {
                  const window = leaveWindowForDay(day, leaveKind, schedules, halfDayPart);
                  return mutations.create.mutateAsync({
                    business: businessId ?? undefined,
                    staff_id: staffId,
                    starts_at: window.starts_at,
                    ends_at: window.ends_at,
                    leave_type: window.leave_type,
                    reason,
                    approved: true,
                  });
                }),
              )
                .then(() => {
                  resetForm();
                  setDialogOpen(false);
                  leavesQuery.refetch();
                })
                .catch((err: Error) => setError(err.message));
            }}
          >
            {mutations.create.isPending
              ? 'Adding…'
              : selectedDays.length
                ? `Add leave (${selectedDays.length})`
                : 'Add leave'}
          </Button>
          {error ? <div style={{ color: '#dc2626' }}>{error}</div> : null}
        </div>
      </Dialog>
    </Card>
  );
}
