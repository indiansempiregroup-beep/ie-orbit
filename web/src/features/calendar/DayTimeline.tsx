import React, { useMemo } from 'react';
import type { AvailabilitySlot, Booking } from '@ie-orbit/sdk';
import { formatTime } from '../../lib/datetime';
import {
  PX_PER_MINUTE,
  bookingStatusColor,
  hourMarks,
  minutesToLabel,
  positionBookings,
  positionOpenSlots,
  resolveDayBounds,
} from './timelineUtils';

type DayTimelineProps = {
  date: string;
  bookings: Booking[];
  slots: AvailabilitySlot[];
  customerMap: Map<string, string>;
  serviceMap: Map<string, string>;
  staffMap: Map<string, string>;
  loading?: boolean;
  errorMessage?: string | null;
  onBookSlot: (slot: AvailabilitySlot) => void;
  onOpenBooking: (bookingId: string) => void;
};

export function DayTimeline({
  date,
  bookings,
  slots,
  customerMap,
  serviceMap,
  staffMap,
  loading = false,
  errorMessage = null,
  onBookSlot,
  onOpenBooking,
}: DayTimelineProps) {
  const bounds = useMemo(() => resolveDayBounds(date, bookings, slots), [date, bookings, slots]);
  const positionedBookings = useMemo(
    () => positionBookings(date, bookings, bounds),
    [date, bookings, bounds],
  );
  const positionedSlots = useMemo(
    () => positionOpenSlots(date, slots, bookings, bounds),
    [date, slots, bookings, bounds],
  );
  const marks = useMemo(() => hourMarks(bounds), [bounds]);
  const height = (bounds.endMinutes - bounds.startMinutes) * PX_PER_MINUTE;

  const surface = '#fff';
  const grid = '#eef2f7';
  const muted = '#6b7280';
  const lane = '#f8fafc';

  if (loading) {
    return <div style={{ padding: 36, textAlign: 'center', color: muted }}>Loading day schedule…</div>;
  }
  if (errorMessage) {
    return <div style={{ padding: 36, textAlign: 'center', color: '#dc2626' }}>{errorMessage}</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', minHeight: height + 24 }}>
      <div style={{ position: 'relative', height }}>
        {marks.map((minute) => (
          <div
            key={`label-${minute}`}
            style={{
              position: 'absolute',
              top: (minute - bounds.startMinutes) * PX_PER_MINUTE - 8,
              right: 10,
              fontSize: 12,
              color: muted,
              fontWeight: minute % 60 === 0 ? 600 : 400,
            }}
          >
            {minute % 60 === 0 ? minutesToLabel(minute) : ''}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          height,
          background: lane,
          borderLeft: `1px solid ${grid}`,
          borderRadius: '0 12px 12px 0',
          overflow: 'hidden',
        }}
      >
        {marks.map((minute) => (
          <div
            key={`line-${minute}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (minute - bounds.startMinutes) * PX_PER_MINUTE,
              borderTop: `1px ${minute % 60 === 0 ? 'solid' : 'dashed'} ${grid}`,
            }}
          />
        ))}

        {positionedSlots.map((row) => (
          <button
            key={`slot-${row.slot.start_at}-${row.slot.staff_id ?? 'any'}`}
            type="button"
            onClick={() => onBookSlot(row.slot)}
            title={`Book ${formatTime(row.slot.start_at)} – ${formatTime(row.slot.end_at)}`}
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: row.top,
              height: Math.max(20, row.height),
              border: '1px dashed #cbd5e1',
              background: 'rgba(226, 232, 240, 0.55)',
              borderRadius: 8,
              color: muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              zIndex: 1,
            }}
          >
            <span>+</span>
            <span>{formatTime(row.slot.start_at)}</span>
          </button>
        ))}

        {positionedBookings.map((row) => {
          const colors = bookingStatusColor(row.booking.status);
          const widthPct = 100 / row.columnCount;
          const leftPct = row.column * widthPct;
          const customer = customerMap.get(String(row.booking.customer_id)) ?? 'Customer';
          const service = serviceMap.get(String(row.booking.service_id)) ?? 'Service';
          const staff = row.booking.staff_id
            ? staffMap.get(String(row.booking.staff_id)) ?? 'Staff'
            : 'Any staff';

          return (
            <button
              key={row.booking.id}
              type="button"
              onClick={() => onOpenBooking(row.booking.id)}
              style={{
                position: 'absolute',
                top: row.top,
                left: `calc(${leftPct}% + 6px)`,
                width: `calc(${widthPct}% - 12px)`,
                height: row.height,
                borderRadius: 10,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.text,
                padding: '6px 8px',
                textAlign: 'left',
                cursor: 'pointer',
                overflow: 'hidden',
                zIndex: 2,
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {customer}
              </div>
              {row.height > 36 ? (
                <div style={{ fontSize: 11, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {service}
                </div>
              ) : null}
              {row.height > 54 ? (
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  {formatTime(row.booking.start_at!)} · {staff}
                </div>
              ) : null}
            </button>
          );
        })}

        {bookings.length === 0 && slots.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: muted,
              background: surface,
              opacity: 0.92,
              zIndex: 3,
            }}
          >
            No bookings or open slots for this day.
          </div>
        ) : null}
      </div>
    </div>
  );
}
