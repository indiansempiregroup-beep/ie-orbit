import type { AvailabilitySlot, Booking } from '@ie-orbit/sdk';

export const PX_PER_MINUTE = 1.4;
export const FALLBACK_START_HOUR = 8;
export const FALLBACK_END_HOUR = 20;

export type DayBounds = {
  startMinutes: number;
  endMinutes: number;
};

export type PositionedInterval = {
  startMinutes: number;
  endMinutes: number;
  top: number;
  height: number;
};

export type PositionedBooking = PositionedInterval & {
  booking: Booking;
  column: number;
  columnCount: number;
};

export type PositionedSlot = PositionedInterval & {
  slot: AvailabilitySlot;
};

function parseLocalMinutes(iso: string, dayKey: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const localKey = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  if (localKey !== dayKey) {
    // Still place using clock time when timezone shifts the calendar day slightly.
  }
  return date.getHours() * 60 + date.getMinutes();
}

export function minutesToLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function resolveDayBounds(
  dayKey: string,
  bookings: Booking[],
  slots: AvailabilitySlot[],
): DayBounds {
  let min = FALLBACK_START_HOUR * 60;
  let max = FALLBACK_END_HOUR * 60;

  const samples: number[] = [];
  for (const booking of bookings) {
    if (booking.start_at) {
      const start = parseLocalMinutes(booking.start_at, dayKey);
      if (start != null) samples.push(start);
    }
    if (booking.end_at) {
      const end = parseLocalMinutes(booking.end_at, dayKey);
      if (end != null) samples.push(end);
    } else if (booking.start_at && booking.duration_minutes) {
      const start = parseLocalMinutes(booking.start_at, dayKey);
      if (start != null) samples.push(start + booking.duration_minutes);
    }
  }
  for (const slot of slots) {
    const start = parseLocalMinutes(slot.start_at, dayKey);
    const end = parseLocalMinutes(slot.end_at, dayKey);
    if (start != null) samples.push(start);
    if (end != null) samples.push(end);
  }

  if (samples.length > 0) {
    min = Math.min(min, ...samples);
    max = Math.max(max, ...samples);
  }

  // Pad to whole hours with breathing room.
  const startMinutes = Math.max(0, Math.floor(min / 60) * 60 - 60);
  const endMinutes = Math.min(24 * 60, Math.ceil(max / 60) * 60 + 60);
  return {
    startMinutes,
    endMinutes: Math.max(endMinutes, startMinutes + 60),
  };
}

export function toPosition(
  startMinutes: number,
  endMinutes: number,
  bounds: DayBounds,
): PositionedInterval {
  const clampedStart = Math.max(startMinutes, bounds.startMinutes);
  const clampedEnd = Math.max(clampedStart + 15, Math.min(endMinutes, bounds.endMinutes));
  return {
    startMinutes: clampedStart,
    endMinutes: clampedEnd,
    top: (clampedStart - bounds.startMinutes) * PX_PER_MINUTE,
    height: Math.max(22, (clampedEnd - clampedStart) * PX_PER_MINUTE - 2),
  };
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export function assignOverlapColumns<T extends { startMinutes: number; endMinutes: number }>(
  items: T[],
): Array<T & { column: number; columnCount: number }> {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const columnEnds: number[] = [];
  const withColumns = sorted.map((item) => {
    let column = columnEnds.findIndex((end) => end <= item.startMinutes);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMinutes);
    } else {
      columnEnds[column] = item.endMinutes;
    }
    return { ...item, column, columnCount: 1 };
  });

  for (let i = 0; i < withColumns.length; i += 1) {
    const current = withColumns[i];
    let groupMax = current.column + 1;
    for (let j = 0; j < withColumns.length; j += 1) {
      if (i === j) continue;
      const other = withColumns[j];
      if (intervalsOverlap(current.startMinutes, current.endMinutes, other.startMinutes, other.endMinutes)) {
        groupMax = Math.max(groupMax, other.column + 1, current.column + 1);
      }
    }
    current.columnCount = groupMax;
  }

  // Normalize columnCount across overlapping clusters.
  for (let i = 0; i < withColumns.length; i += 1) {
    let clusterMax = withColumns[i].columnCount;
    for (let j = 0; j < withColumns.length; j += 1) {
      if (
        intervalsOverlap(
          withColumns[i].startMinutes,
          withColumns[i].endMinutes,
          withColumns[j].startMinutes,
          withColumns[j].endMinutes,
        )
      ) {
        clusterMax = Math.max(clusterMax, withColumns[j].columnCount, withColumns[j].column + 1);
      }
    }
    for (let j = 0; j < withColumns.length; j += 1) {
      if (
        intervalsOverlap(
          withColumns[i].startMinutes,
          withColumns[i].endMinutes,
          withColumns[j].startMinutes,
          withColumns[j].endMinutes,
        )
      ) {
        withColumns[j].columnCount = clusterMax;
      }
    }
  }

  return withColumns;
}

export function positionBookings(dayKey: string, bookings: Booking[], bounds: DayBounds): PositionedBooking[] {
  const base = bookings
    .filter((booking) => booking.start_at)
    .map((booking) => {
      const startMinutes = parseLocalMinutes(booking.start_at!, dayKey) ?? bounds.startMinutes;
      const endMinutes = booking.end_at
        ? parseLocalMinutes(booking.end_at, dayKey) ?? startMinutes + (booking.duration_minutes ?? 30)
        : startMinutes + (booking.duration_minutes ?? 30);
      return {
        booking,
        ...toPosition(startMinutes, endMinutes, bounds),
      };
    });
  return assignOverlapColumns(base);
}

export function positionOpenSlots(
  dayKey: string,
  slots: AvailabilitySlot[],
  bookings: Booking[],
  bounds: DayBounds,
): PositionedSlot[] {
  const bookingRanges = bookings
    .filter((booking) => booking.start_at && booking.status !== 'cancelled')
    .map((booking) => {
      const start = parseLocalMinutes(booking.start_at!, dayKey) ?? 0;
      const end = booking.end_at
        ? parseLocalMinutes(booking.end_at, dayKey) ?? start + (booking.duration_minutes ?? 30)
        : start + (booking.duration_minutes ?? 30);
      return { start, end };
    });

  return slots
    .map((slot) => {
      const startMinutes = parseLocalMinutes(slot.start_at, dayKey);
      const endMinutes = parseLocalMinutes(slot.end_at, dayKey);
      if (startMinutes == null || endMinutes == null) return null;
      const overlapsBooking = bookingRanges.some((range) =>
        intervalsOverlap(startMinutes, endMinutes, range.start, range.end),
      );
      if (overlapsBooking) return null;
      return {
        slot,
        ...toPosition(startMinutes, endMinutes, bounds),
      };
    })
    .filter((row): row is PositionedSlot => row != null);
}

export function hourMarks(bounds: DayBounds): number[] {
  const marks: number[] = [];
  for (let minute = bounds.startMinutes; minute <= bounds.endMinutes; minute += 30) {
    marks.push(minute);
  }
  return marks;
}

export function bookingStatusColor(status?: string): { bg: string; border: string; text: string } {
  switch (status) {
    case 'confirmed':
      return { bg: 'rgba(16, 185, 129, 0.16)', border: '#10b981', text: '#047857' };
    case 'pending':
      return { bg: 'rgba(245, 158, 11, 0.16)', border: '#f59e0b', text: '#b45309' };
    case 'checked_in':
    case 'in_progress':
      return { bg: 'rgba(59, 130, 246, 0.16)', border: '#3b82f6', text: '#1d4ed8' };
    case 'cancelled':
    case 'no_show':
    case 'rejected':
      return { bg: 'rgba(220, 38, 38, 0.12)', border: '#dc2626', text: '#b91c1c' };
    case 'completed':
      return { bg: 'rgba(107, 114, 128, 0.14)', border: '#6b7280', text: '#374151' };
    default:
      return { bg: 'rgba(99, 102, 241, 0.12)', border: '#6366f1', text: '#4338ca' };
  }
}
