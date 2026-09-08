import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PickerSheet } from './PickerSheet';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { FieldLabel } from './ui/FieldLabel';
import { fieldStyles } from './ui/fieldStyles';

type Props = {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  helperText?: string;
  allowClear?: boolean;
  minuteStep?: number;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseHhmm(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || hours > 23 || !Number.isFinite(minutes) || minutes > 59) return null;
  const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return { hours, minutes, hour12, period };
}

export function formatTimeLabel(value: string) {
  const parsed = parseHhmm(value);
  if (!parsed) return '';
  return `${parsed.hour12}:${pad(parsed.minutes)} ${parsed.period}`;
}

function toHhmm(hour12: number, minutes: number, period: 'AM' | 'PM') {
  let hours = hour12 % 12;
  if (period === 'PM') hours += 12;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function TimeField({
  label,
  value,
  onChange,
  helperText,
  allowClear = false,
  minuteStep = 15,
  placeholder = 'Select time',
  required,
  optional,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hour12, setHour12] = useState(9);
  const [minutes, setMinutes] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const display = formatTimeLabel(value);

  const hourChoices = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minuteChoices = useMemo(() => {
    const mins = new Set<number>();
    for (let minute = 0; minute < 60; minute += minuteStep) mins.add(minute);
    mins.add(minutes);
    return [...mins].sort((a, b) => a - b);
  }, [minuteStep, minutes]);

  useEffect(() => {
    if (!open) return;
    const parsed = parseHhmm(value);
    setHour12(parsed?.hour12 ?? 9);
    setMinutes(parsed?.minutes ?? 0);
    setPeriod(parsed?.period ?? 'AM');
  }, [open, value]);

  const draftValue = toHhmm(hour12, minutes, period);
  const preview = formatTimeLabel(draftValue);

  return (
    <View style={fieldStyles.wrap}>
      <FieldLabel label={label} required={required} optional={optional} />
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [
            fieldStyles.control,
            styles.trigger,
            pressed && fieldStyles.controlPressed,
            error ? fieldStyles.controlError : null,
          ]}
          onPress={() => setOpen(true)}
        >
          <Feather name="clock" size={16} color={colors.primary} />
          <Text style={[fieldStyles.value, !display && fieldStyles.placeholder]}>
            {display || placeholder}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable style={fieldStyles.clearBtn} onPress={() => onChange('')} accessibilityLabel="Clear time">
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <PickerSheet
        visible={open}
        title={label}
        preview={preview}
        icon="clock"
        onClose={() => setOpen(false)}
        actionLabel="Set time"
        onAction={() => {
          onChange(draftValue);
          setOpen(false);
        }}
      >
        <View style={styles.periodRow}>
          {(['AM', 'PM'] as const).map((next) => (
            <Pressable
              key={next}
              style={[styles.periodChip, period === next && styles.choiceActive]}
              onPress={() => setPeriod(next)}
            >
              <Text style={[styles.choiceText, period === next && styles.choiceTextActive]}>{next}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.groupLabel}>Hour</Text>
        <View style={styles.grid}>
          {hourChoices.map((hour) => (
            <Pressable
              key={hour}
              style={[styles.choice, hour12 === hour && styles.choiceActive]}
              onPress={() => setHour12(hour)}
            >
              <Text style={[styles.choiceText, hour12 === hour && styles.choiceTextActive]}>{hour}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.groupLabel}>Minutes</Text>
        <View style={styles.grid}>
          {minuteChoices.map((minute) => (
            <Pressable
              key={minute}
              style={[styles.choice, minutes === minute && styles.choiceActive]}
              onPress={() => setMinutes(minute)}
            >
              <Text style={[styles.choiceText, minutes === minute && styles.choiceTextActive]}>
                {pad(minute)}
              </Text>
            </Pressable>
          ))}
        </View>
      </PickerSheet>

      {error ? <Text style={fieldStyles.error}>{error}</Text> : helperText ? <Text style={fieldStyles.hint}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trigger: { flex: 1, gap: spacing.sm },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  periodChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  groupLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  choice: {
    width: 52,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  choiceTextActive: { color: colors.primaryForeground },
});
