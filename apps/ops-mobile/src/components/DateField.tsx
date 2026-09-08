import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CalendarPicker } from './CalendarPicker';
import { PickerSheet } from './PickerSheet';
import { colors, spacing } from '../theme/tokens';
import { FieldLabel } from './ui/FieldLabel';
import { fieldStyles } from './ui/fieldStyles';

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  helperText?: string;
  allowClear?: boolean;
  allowPast?: boolean;
  allowFuture?: boolean;
  pastYears?: number;
  required?: boolean;
  optional?: boolean;
  error?: string;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shiftIsoYear(iso: string, nextYear: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${nextYear}-01-01`;
  const [, month, day] = iso.split('-');
  const maxDay = new Date(Number(nextYear), Number(month), 0).getDate();
  const nextDay = String(Math.min(Number(day), maxDay)).padStart(2, '0');
  return `${nextYear}-${month}-${nextDay}`;
}

function formatDisplay(iso: string, long = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: long ? 'long' : undefined,
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
}

export function DateField({
  label,
  value,
  onChange,
  helperText,
  allowClear = true,
  allowPast = true,
  allowFuture = true,
  pastYears = 40,
  required,
  optional,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [browseIso, setBrowseIso] = useState(value || '');
  const today = todayIso();
  const nowYear = new Date().getFullYear();
  const minYear = allowPast ? nowYear - pastYears : nowYear;
  const maxYear = allowFuture ? nowYear + 5 : nowYear;

  useEffect(() => {
    if (value) setBrowseIso(value);
  }, [value]);

  const preview = useMemo(() => {
    const iso = value || browseIso;
    return iso ? formatDisplay(iso, true) : 'Pick a day';
  }, [value, browseIso]);

  function pick(next: string) {
    onChange(next);
    setBrowseIso(next);
    setOpen(false);
  }

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
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={[fieldStyles.value, !value && fieldStyles.placeholder]}>
            {value ? formatDisplay(value) : 'Select date'}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            style={fieldStyles.clearBtn}
            onPress={() => {
              onChange('');
              setBrowseIso('');
            }}
            accessibilityLabel="Clear date"
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <PickerSheet
        visible={open}
        title={label}
        preview={preview}
        icon="calendar"
        onClose={() => setOpen(false)}
      >
        <CalendarPicker
          value={value}
          viewDate={browseIso || value || today}
          onChange={pick}
          allowPast={allowPast}
          allowFuture={allowFuture}
          minYear={minYear}
          maxYear={maxYear}
          onYearChange={(year) => {
            const next = shiftIsoYear(value || browseIso || today, String(year));
            setBrowseIso(next);
            if (value) onChange(next);
          }}
        />
        <Pressable style={styles.todayBtn} onPress={() => pick(today)}>
          <Feather name="sun" size={16} color={colors.primary} />
          <Text style={styles.todayLabel}>Jump to today</Text>
        </Pressable>
      </PickerSheet>

      {error ? <Text style={fieldStyles.error}>{error}</Text> : helperText ? <Text style={fieldStyles.hint}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trigger: { flex: 1, gap: spacing.sm },
  todayBtn: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.tint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  todayLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});
