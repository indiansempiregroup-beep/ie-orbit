import type { StaffWeeklySchedule } from '@ie-orbit/sdk';

export type LeaveDayKind = 'full_day' | 'half_day';
export type HalfDayPart = 'first' | 'second';

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

function formatClock(clock: Clock) {
  const period = clock.hours >= 12 ? 'PM' : 'AM';
  const hour12 = clock.hours % 12 === 0 ? 12 : clock.hours % 12;
  return `${hour12}:${String(clock.minutes).padStart(2, '0')} ${period}`;
}

/** Build leave start/end for a calendar day using staff schedule when available. */
export function leaveWindowForDay(
  isoDate: string,
  kind: LeaveDayKind,
  schedules: StaffWeeklySchedule[] = [],
  halfDayPart: HalfDayPart = 'first',
): { starts_at: string; ends_at: string; leave_type: string } {
  const weekday = weekdayFromIso(isoDate);
  const schedule = schedules.find((row) => row.weekday === weekday && row.is_available !== false);
  const shiftStart = parseClock(schedule?.shift_start, { hours: 9, minutes: 0 });
  const shiftEnd = parseClock(schedule?.shift_end, { hours: 18, minutes: 0 });
  const halfEnd = midpoint(shiftStart, shiftEnd);

  if (kind === 'half_day') {
    if (halfDayPart === 'second') {
      return {
        starts_at: atLocal(isoDate, halfEnd).toISOString(),
        ends_at: atLocal(isoDate, shiftEnd).toISOString(),
        leave_type: 'half_day_second',
      };
    }
    return {
      starts_at: atLocal(isoDate, shiftStart).toISOString(),
      ends_at: atLocal(isoDate, halfEnd).toISOString(),
      leave_type: 'half_day_first',
    };
  }

  return {
    starts_at: atLocal(isoDate, shiftStart).toISOString(),
    ends_at: atLocal(isoDate, shiftEnd).toISOString(),
    leave_type: 'full_day',
  };
}

export function halfDayWindowLabel(
  isoDate: string,
  halfDayPart: HalfDayPart,
  schedules: StaffWeeklySchedule[] = [],
) {
  const weekday = weekdayFromIso(isoDate);
  const schedule = schedules.find((row) => row.weekday === weekday && row.is_available !== false);
  const shiftStart = parseClock(schedule?.shift_start, { hours: 9, minutes: 0 });
  const shiftEnd = parseClock(schedule?.shift_end, { hours: 18, minutes: 0 });
  const halfEnd = midpoint(shiftStart, shiftEnd);
  if (halfDayPart === 'second') {
    return `${formatClock(halfEnd)} – ${formatClock(shiftEnd)}`;
  }
  return `${formatClock(shiftStart)} – ${formatClock(halfEnd)}`;
}

export function formatLeaveKind(leaveType: string | undefined) {
  if (leaveType === 'half_day' || leaveType === 'half_day_first') return 'Half day (first half)';
  if (leaveType === 'half_day_second') return 'Half day (second half)';
  if (leaveType === 'full_day') return 'Full day';
  return (leaveType || 'Leave').replace(/_/g, ' ');
}
