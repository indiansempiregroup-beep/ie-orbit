import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type SingleProps = {
  mode?: 'single';
  value: string;
  onChange: (isoDate: string) => void;
  values?: never;
  onChangeValues?: never;
  allowPast?: boolean;
  allowFuture?: boolean;
  minYear?: number;
  maxYear?: number;
  /** Month to show when browsing without changing the selected value. */
  viewDate?: string;
  onYearChange?: (year: number) => void;
};

type MultiProps = {
  mode: 'multiple';
  values: string[];
  onChangeValues: (isoDates: string[]) => void;
  value?: never;
  onChange?: never;
  allowPast?: boolean;
  allowFuture?: boolean;
  minYear?: number;
  maxYear?: number;
  viewDate?: string;
  onYearChange?: (year: number) => void;
};

type Props = SingleProps | MultiProps;

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function CalendarPicker(props: Props) {
  const allowPast = props.allowPast ?? true;
  const allowFuture = props.allowFuture ?? true;
  const nowYear = new Date().getFullYear();
  const minYear = props.minYear ?? (allowPast ? nowYear - 80 : nowYear);
  const maxYear = props.maxYear ?? (allowFuture ? nowYear + 10 : nowYear);

  function clampMonth(next: Date) {
    const year = Math.min(maxYear, Math.max(minYear, next.getFullYear()));
    return new Date(year, next.getMonth(), 1);
  }

  const isMulti = props.mode === 'multiple';
  const selectedKey = isMulti ? props.values.join(',') : props.value || '';
  const selectedSet = useMemo(
    () => new Set(selectedKey ? selectedKey.split(',') : []),
    [selectedKey],
  );
  const anchor =
    props.viewDate ||
    (isMulti
      ? props.values[props.values.length - 1] || toIso(new Date())
      : props.value || toIso(new Date()));
  const selectedDate = parseIso(anchor);
  const [month, setMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [pickingYear, setPickingYear] = useState(false);
  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = maxYear; year >= minYear; year -= 1) list.push(year);
    return list;
  }, [minYear, maxYear]);

  useEffect(() => {
    if (!anchor) return;
    const next = parseIso(anchor);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [anchor]);

  const canPrevMonth =
    month.getFullYear() > minYear || (month.getFullYear() === minYear && month.getMonth() > 0);
  const canNextMonth =
    month.getFullYear() < maxYear || (month.getFullYear() === maxYear && month.getMonth() < 11);
  function selectYear(year: number) {
    setMonth(clampMonth(new Date(year, month.getMonth(), 1)));
    setPickingYear(false);
    props.onYearChange?.(year);
  }

  const weeks = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const mondayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const cells: Array<{ day: number | null; iso?: string }> = [];
    for (let i = 0; i < mondayOffset; i += 1) cells.push({ day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, iso: toIso(new Date(year, monthIndex, day)) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null });
    const rows: Array<Array<{ day: number | null; iso?: string }>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [month]);

  const todayIso = toIso(new Date());

  function toggleDay(iso: string) {
    if (isMulti) {
      const next = new Set(props.values);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      props.onChangeValues([...next].sort());
      return;
    }
    props.onChange(iso);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={[styles.navBtn, (pickingYear || !canPrevMonth) && styles.navBtnDisabled]}
          disabled={pickingYear || !canPrevMonth}
          onPress={() => setMonth(clampMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}
          accessibilityLabel="Previous month"
        >
          <Feather name="chevron-left" size={16} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={styles.monthBtn}
          onPress={() => setPickingYear((current) => !current)}
          accessibilityLabel="Select year"
        >
          <Text style={styles.monthLabel}>
            {pickingYear
              ? 'Select year'
              : month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Text>
          <Feather
            name={pickingYear ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.primary}
          />
        </Pressable>
        <Pressable
          style={[styles.navBtn, (pickingYear || !canNextMonth) && styles.navBtnDisabled]}
          disabled={pickingYear || !canNextMonth}
          onPress={() => setMonth(clampMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}
          accessibilityLabel="Next month"
        >
          <Feather name="chevron-right" size={16} color={colors.foreground} />
        </Pressable>
      </View>
      {pickingYear ? (
        <View style={styles.yearGrid}>
          {years.map((year) => {
            const selected = year === month.getFullYear();
            return (
              <Pressable
                key={year}
                style={[styles.yearChip, selected && styles.yearChipSelected]}
                onPress={() => selectYear(year)}
              >
                <Text style={[styles.yearChipText, selected && styles.yearChipTextSelected]}>{year}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.weekRow}>
          {week.map((cell, cellIndex) => {
            if (!cell.day || !cell.iso) {
              return <View key={`empty-${weekIndex}-${cellIndex}`} style={styles.cell} />;
            }
            const isSelected = selectedSet.has(cell.iso);
            const isToday = cell.iso === todayIso;
            const isPast = cell.iso < todayIso;
            const isFuture = cell.iso > todayIso;
            const disabled = (!allowPast && isPast) || (!allowFuture && isFuture);
            return (
              <Pressable
                key={cell.iso}
                disabled={disabled}
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: colors.primary },
                  isToday && !isSelected && styles.todayCell,
                ]}
                onPress={() => toggleDay(cell.iso!)}
              >
                <Text
                  style={[
                    styles.dayText,
                    isSelected && styles.dayTextSelected,
                    disabled && styles.dayTextPast,
                    isToday && !isSelected && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  {cell.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.sm },
  navPair: { flexDirection: 'row', gap: 4 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  monthLabel: {
    ...typography.label,
    color: colors.foreground,
    textAlign: 'center',
  },
  navBtnDisabled: { opacity: 0.35 },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearChip: {
    width: '31%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearChipText: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  yearChipTextSelected: { color: colors.primaryForeground },
  weekdays: { flexDirection: 'row', marginBottom: spacing.sm },
  weekday: { flex: 1, textAlign: 'center', ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  todayCell: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayText: { ...typography.body, color: colors.foreground },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextPast: { color: colors.mutedForeground, opacity: 0.45 },
});
