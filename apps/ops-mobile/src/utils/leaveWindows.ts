import type { StaffWeeklySchedule } from '@ie-orbit/sdk';

export type LeaveDayKind = 'full_day' | 'half_day';

type Clock = { hours: number; minutes: number };

function parseClock(value: string | undefined, fallback: Clock): Clock {
  if (!value) return fallback;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return { hours, minutes };
}

function weekdayFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  // JS: 0=Sun..6=Sat → API weekday: 0=Mon..6=Sun
  const jsDay = new Date(year, month - 1, day).getDay();
  return (jsDay + 6) % 7;
}

function atLocal(isoDate: string, clock: Clock) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, clock.hours, clock.minutes, 0, 0);
}

function midpoint(start: Clock, end: Clock): Clock {
  const startMins = start.hours * 60 + start.minutes;
  const endMins = end.hours * 60 + end.minutes;
  const mid = Math.floor((startMins + endMins) / 2);
  return { hours: Math.floor(mid / 60), minutes: mid % 60 };
}

/** Build leave start/end for a calendar day using staff schedule when available. */
export function leaveWindowForDay(
  isoDate: string,
  kind: LeaveDayKind,
  schedules: StaffWeeklySchedule[] = [],
): { starts_at: string; ends_at: string; leave_type: LeaveDayKind } {
  const weekday = weekdayFromIso(isoDate);
  const schedule = schedules.find((row) => row.weekday === weekday && row.is_available !== false);
  const shiftStart = parseClock(schedule?.shift_start, { hours: 9, minutes: 0 });
  const shiftEnd = parseClock(schedule?.shift_end, { hours: 18, minutes: 0 });

  if (kind === 'half_day') {
    const halfEnd = midpoint(shiftStart, shiftEnd);
    return {
      starts_at: atLocal(isoDate, shiftStart).toISOString(),
      ends_at: atLocal(isoDate, halfEnd).toISOString(),
      leave_type: 'half_day',
    };
  }

  return {
    starts_at: atLocal(isoDate, shiftStart).toISOString(),
    ends_at: atLocal(isoDate, shiftEnd).toISOString(),
    leave_type: 'full_day',
  };
}

export function formatLeaveKind(leaveType: string | undefined) {
  if (leaveType === 'half_day') return 'Half day';
  if (leaveType === 'full_day') return 'Full day';
  return (leaveType || 'Leave').replace(/_/g, ' ');
}
