import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  allowPast?: boolean;
};

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

export function CalendarPicker({ value, onChange, allowPast = true }: Props) {
  const selectedDate = value ? parseIso(value) : new Date();
  const [month, setMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (!value) return;
    const next = parseIso(value);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [value]);

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

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={styles.navBtn}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Feather name="chevron-left" size={16} color={colors.foreground} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          style={styles.navBtn}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Feather name="chevron-right" size={16} color={colors.foreground} />
        </Pressable>
      </View>
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
            const isSelected = cell.iso === value;
            const isToday = cell.iso === todayIso;
            const isPast = cell.iso < todayIso;
            const disabled = !allowPast && isPast;
            return (
              <Pressable
                key={cell.iso}
                disabled={disabled}
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: colors.primary },
                  isToday && !isSelected && styles.todayCell,
                ]}
                onPress={() => onChange(cell.iso!)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography.label, color: colors.foreground, fontWeight: '700' },
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
