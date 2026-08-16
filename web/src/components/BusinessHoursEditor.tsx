import { Input } from './Input';
import {
  BUSINESS_HOUR_DAYS,
  type DayHours,
  type WeeklyHours,
} from '../lib/businessHours';

type BusinessHoursEditorProps = {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  disabled?: boolean;
};

export function BusinessHoursEditor({ value, onChange, disabled }: BusinessHoursEditorProps) {
  function updateDay(day: keyof WeeklyHours, patch: Partial<DayHours>) {
    onChange({
      ...value,
      [day]: { ...value[day], ...patch },
    });
  }

  return (
    <div className="business-hours-editor">
      {BUSINESS_HOUR_DAYS.map((day) => {
        const row = value[day.value];
        return (
          <div key={day.value} className="business-hours-row">
            <label className="business-hours-day">
              <input
                type="checkbox"
                checked={row.open}
                disabled={disabled}
                onChange={(event) => updateDay(day.value, { open: event.target.checked })}
              />
              <span>{day.label}</span>
            </label>
            <Input
              label="Opens"
              type="time"
              value={row.start}
              disabled={disabled || !row.open}
              onChange={(event) => updateDay(day.value, { start: event.target.value })}
              style={{ marginBottom: 0 }}
            />
            <Input
              label="Closes"
              type="time"
              value={row.end}
              disabled={disabled || !row.open}
              onChange={(event) => updateDay(day.value, { end: event.target.value })}
              style={{ marginBottom: 0 }}
            />
          </div>
        );
      })}
    </div>
  );
}
