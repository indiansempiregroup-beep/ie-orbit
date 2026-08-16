export const BUSINESS_HOUR_DAYS = [
  { value: 'monday', label: 'Monday', weekday: 0 },
  { value: 'tuesday', label: 'Tuesday', weekday: 1 },
  { value: 'wednesday', label: 'Wednesday', weekday: 2 },
  { value: 'thursday', label: 'Thursday', weekday: 3 },
  { value: 'friday', label: 'Friday', weekday: 4 },
  { value: 'saturday', label: 'Saturday', weekday: 5 },
  { value: 'sunday', label: 'Sunday', weekday: 6 },
] as const;

export type BusinessHourDay = (typeof BUSINESS_HOUR_DAYS)[number]['value'];

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
};

export type WeeklyHours = Record<BusinessHourDay, DayHours>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function createDefaultWeeklyHours(): WeeklyHours {
  return BUSINESS_HOUR_DAYS.reduce((hours, day) => {
    hours[day.value] = {
      open: day.value !== 'sunday',
      start: '09:00',
      end: '18:00',
    };
    return hours;
  }, {} as WeeklyHours);
}

export function weeklyHoursFromSettings(businessHours: unknown): WeeklyHours {
  const defaults = createDefaultWeeklyHours();
  const source = asRecord(businessHours);
  const days = asRecord(source.days);
  const fallbackStart = asString(source.start, '09:00');
  const fallbackEnd = asString(source.end, '18:00');
  const hasDays = Object.keys(days).length > 0;

  return BUSINESS_HOUR_DAYS.reduce((hours, day) => {
    const row = asRecord(days[day.value]);
    hours[day.value] = {
      open: hasDays ? Boolean(row.open) : day.value !== 'sunday',
      start: asString(row.start, fallbackStart),
      end: asString(row.end, fallbackEnd),
    };
    return hours;
  }, {} as WeeklyHours);
}

export function weeklyHoursConfigured(businessHours: unknown): boolean {
  const source = asRecord(businessHours);
  const days = asRecord(source.days);
  if (Object.keys(days).length > 0) {
    return Object.values(days).some((row) => Boolean(asRecord(row).open));
  }
  return Boolean(source.start && source.end);
}

export function serializeWeeklyHours(
  hours: WeeklyHours,
  weekStartDay: string,
): Record<string, unknown> {
  const openDays = BUSINESS_HOUR_DAYS.filter((day) => hours[day.value]?.open);
  const firstOpen = openDays[0] ? hours[openDays[0].value] : hours.monday;
  return {
    week_start_day: weekStartDay,
    start: firstOpen?.start ?? '09:00',
    end: firstOpen?.end ?? '18:00',
    days: BUSINESS_HOUR_DAYS.reduce(
      (days, day) => {
        days[day.value] = hours[day.value];
        return days;
      },
      {} as Record<string, DayHours>,
    ),
  };
}

export function summarizeWeeklyHours(hours: WeeklyHours): string {
  const groups: string[] = [];
  let index = 0;
  while (index < BUSINESS_HOUR_DAYS.length) {
    const day = BUSINESS_HOUR_DAYS[index];
    const current = hours[day.value];
    if (!current?.open) {
      index += 1;
      continue;
    }
    let endIndex = index;
    while (endIndex + 1 < BUSINESS_HOUR_DAYS.length) {
      const next = BUSINESS_HOUR_DAYS[endIndex + 1];
      const nextHours = hours[next.value];
      if (
        !nextHours?.open ||
        nextHours.start !== current.start ||
        nextHours.end !== current.end
      ) {
        break;
      }
      endIndex += 1;
    }
    const startLabel = BUSINESS_HOUR_DAYS[index].label.slice(0, 3);
    const endLabel = BUSINESS_HOUR_DAYS[endIndex].label.slice(0, 3);
    const range = index === endIndex ? startLabel : `${startLabel}–${endLabel}`;
    groups.push(`${range} ${current.start}–${current.end}`);
    index = endIndex + 1;
  }
  return groups.length ? groups.join(', ') : 'Closed every day';
}

export function weeklyHoursAreValid(hours: WeeklyHours): boolean {
  const openDays = BUSINESS_HOUR_DAYS.filter((day) => hours[day.value]?.open);
  if (!openDays.length) return false;
  return openDays.every((day) => {
    const row = hours[day.value];
    return Boolean(row.start) && Boolean(row.end) && row.start < row.end;
  });
}
