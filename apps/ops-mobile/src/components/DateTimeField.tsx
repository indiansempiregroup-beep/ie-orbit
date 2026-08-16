import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
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

function combine(dateKey: string, timeKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = timeKey.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function DateTimeField({ label, value, onChange, minuteStep = 15 }: Props) {
  const dateKey = toDateKey(value);
  const timeKey = toTimeKey(value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <DateField
        label="Date"
        value={dateKey}
        onChange={(next) => onChange(combine(next, timeKey))}
        allowClear={false}
      />
      <TimeField
        label="Time"
        value={timeKey}
        onChange={(next) => onChange(combine(dateKey, next))}
        minuteStep={minuteStep}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground, fontWeight: '700' },
});
