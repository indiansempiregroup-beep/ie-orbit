import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StaffWeeklyScheduleInput } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { useTheme } from '../../hooks/useTheme';
import { useStaffWeeklyScheduleBulkUpsert, useStaffWeeklySchedules } from './staffScheduleHooks';

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
] as const;

type DayRow = StaffWeeklyScheduleInput & { label: string };

function defaultRows(): DayRow[] {
  return WEEKDAYS.map((day) => ({
    label: day.label,
    weekday: day.value,
    is_available: day.value < 6,
    shift_start: '09:00',
    shift_end: day.value === 6 ? '17:00' : '19:00',
    capacity: 1,
  }));
}

function toTimeInput(value: string) {
  return value.slice(0, 5);
}

type StaffWeeklyScheduleSectionProps = {
  staffId: string;
};

export function StaffWeeklyScheduleSection({ staffId }: StaffWeeklyScheduleSectionProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { businessId } = useWorkspaceScope();
  const schedulesQuery = useStaffWeeklySchedules(staffId);
  const bulkUpsert = useStaffWeeklyScheduleBulkUpsert();
  const [rows, setRows] = useState<DayRow[]>(defaultRows);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!schedulesQuery.data) return;
    const byWeekday = new Map(schedulesQuery.data.map((row) => [row.weekday, row]));
    setRows(
      WEEKDAYS.map((day) => {
        const existing = byWeekday.get(day.value);
        if (!existing) {
          return {
            label: day.label,
            weekday: day.value,
            is_available: false,
            shift_start: '09:00',
            shift_end: '17:00',
            capacity: 1,
          };
        }
        return {
          label: day.label,
          weekday: day.value,
          is_available: existing.is_available,
          shift_start: toTimeInput(existing.shift_start),
          shift_end: toTimeInput(existing.shift_end),
          capacity: existing.capacity,
        };
      }),
    );
  }, [schedulesQuery.data]);

  const activeDays = useMemo(() => rows.filter((row) => row.is_available).length, [rows]);

  return (
    <Card style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Weekly slot availability</p>
          <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
            Configure which days and hours this staff member is available for bookings.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate(`/calendar?staff=${staffId}`)}>
          Preview calendar
        </Button>
      </div>

      <div style={{ display: 'grid', gap: 1, overflow: 'hidden', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.7fr 1fr 1fr 0.7fr',
            padding: '12px 16px',
            background: theme.resolved === 'dark' ? '#111827' : '#f9fafb',
            fontWeight: 700,
            color: '#6b7280',
            gap: 8,
          }}
        >
          <span>Day</span>
          <span>Available</span>
          <span>Start</span>
          <span>End</span>
          <span>Capacity</span>
        </div>
        {schedulesQuery.isLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>Loading schedule…</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.weekday}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.7fr 1fr 1fr 0.7fr',
                padding: '12px 16px',
                background: theme.resolved === 'dark' ? '#111827' : '#fff',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span>{row.label}</span>
              <input
                type="checkbox"
                checked={row.is_available}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.weekday === row.weekday ? { ...item, is_available: event.target.checked } : item,
                    ),
                  )
                }
                aria-label={`${row.label} available`}
              />
              <input
                type="time"
                value={row.shift_start}
                disabled={!row.is_available}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.weekday === row.weekday ? { ...item, shift_start: event.target.value } : item,
                    ),
                  )
                }
                style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <input
                type="time"
                value={row.shift_end}
                disabled={!row.is_available}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.weekday === row.weekday ? { ...item, shift_end: event.target.value } : item,
                    ),
                  )
                }
                style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <input
                type="number"
                min={1}
                value={row.capacity}
                disabled={!row.is_available}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.weekday === row.weekday ? { ...item, capacity: Number(event.target.value) } : item,
                    ),
                  )
                }
                style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <p style={{ margin: 0, color: '#6b7280' }}>{activeDays} active day(s)</p>
        <Button
          type="button"
          variant="primary"
          disabled={bulkUpsert.isPending || schedulesQuery.isLoading || !businessId}
          onClick={() => {
            setSaveError(null);
            bulkUpsert.mutate(
              {
                business: businessId ?? undefined,
                staff_id: staffId,
                schedules: rows.map((row) => ({
                  weekday: row.weekday,
                  is_available: row.is_available,
                  shift_start: `${row.shift_start}:00`,
                  shift_end: `${row.shift_end}:00`,
                  capacity: row.capacity,
                })),
              },
              {
                onError: (error) => setSaveError(error.message ?? 'Failed to save schedule'),
              },
            );
          }}
        >
          {bulkUpsert.isPending ? 'Saving…' : 'Save availability'}
        </Button>
      </div>
      {saveError ? <div style={{ color: '#dc2626' }}>{saveError}</div> : null}
      {bulkUpsert.isSuccess ? <div style={{ color: '#10b981' }}>Availability saved.</div> : null}
    </Card>
  );
}
