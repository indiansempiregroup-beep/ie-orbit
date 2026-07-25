import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarPicker } from './CalendarPicker';
import { SelectField } from './SelectField';
import { colors, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  minuteStep?: number;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toTimeKey(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function buildTimeOptions(step: number) {
  const options: Array<{ value: string; label: string }> = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${pad(hours)}:${pad(mins)}`;
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    options.push({ value, label: `${hour12}:${pad(mins)} ${period}` });
  }
  return options;
}

function combine(dateKey: string, timeKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = timeKey.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function DateTimeField({ label, value, onChange, minuteStep = 15 }: Props) {
  const timeOptions = useMemo(() => buildTimeOptions(minuteStep), [minuteStep]);
  const dateKey = toDateKey(value);
  const timeKey = toTimeKey(value);
  const hasExactTime = timeOptions.some((option) => option.value === timeKey);
  const options = hasExactTime
    ? timeOptions
    : [{ value: timeKey, label: timeKey }, ...timeOptions];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <CalendarPicker value={dateKey} onChange={(next) => onChange(combine(next, timeKey))} />
      <View style={styles.timeWrap}>
        <SelectField
          label="Time"
          value={timeKey}
          options={options}
          onChange={(next) => onChange(combine(dateKey, next))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  timeWrap: { marginTop: spacing.xs },
});
