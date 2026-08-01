import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CalendarPicker } from './CalendarPicker';
import { SelectField } from './SelectField';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  helperText?: string;
  allowClear?: boolean;
  allowPast?: boolean;
  allowFuture?: boolean;
  /** How far back year options go when allowPast is true. */
  pastYears?: number;
};

function formatDisplay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildYearOptions(allowPast: boolean, allowFuture: boolean, pastYears: number) {
  const current = new Date().getFullYear();
  const start = allowPast ? current - pastYears : current;
  const end = allowFuture ? current + 5 : current;
  const options: Array<{ value: string; label: string }> = [];
  for (let year = end; year >= start; year -= 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

function shiftIsoYear(iso: string, nextYear: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${nextYear}-01-01`;
  const [, month, day] = iso.split('-');
  const maxDay = new Date(Number(nextYear), Number(month), 0).getDate();
  const nextDay = String(Math.min(Number(day), maxDay)).padStart(2, '0');
  return `${nextYear}-${month}-${nextDay}`;
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [browseIso, setBrowseIso] = useState(value || '');

  useEffect(() => {
    if (value) setBrowseIso(value);
  }, [value]);

  const yearOptions = useMemo(
    () => buildYearOptions(allowPast, allowFuture, pastYears),
    [allowPast, allowFuture, pastYears],
  );
  const selectedYear =
    (browseIso || value || '').slice(0, 4) || String(new Date().getFullYear());

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable style={styles.trigger} onPress={() => setOpen((current) => !current)}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={[styles.triggerText, !value && styles.placeholder]}>
            {value ? formatDisplay(value) : 'Select date'}
          </Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              onChange('');
              setBrowseIso('');
              setOpen(false);
            }}
            accessibilityLabel="Clear date"
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.picker}>
          <SelectField
            label="Year"
            value={selectedYear}
            options={
              yearOptions.some((option) => option.value === selectedYear)
                ? yearOptions
                : [{ value: selectedYear, label: selectedYear }, ...yearOptions]
            }
            onChange={(nextYear) => {
              if (value) {
                onChange(shiftIsoYear(value, nextYear));
              } else {
                setBrowseIso(`${nextYear}-01-01`);
              }
            }}
          />
          <CalendarPicker
            value={value}
            viewDate={browseIso || value || `${selectedYear}-01-01`}
            onChange={(next) => {
              onChange(next);
              setBrowseIso(next);
              setOpen(false);
            }}
            allowPast={allowPast}
            allowFuture={allowFuture}
          />
        </View>
      ) : null}

      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trigger: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  triggerText: { ...typography.body, color: colors.foreground, flex: 1 },
  placeholder: { color: colors.mutedForeground },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  picker: { gap: spacing.sm },
  helper: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
