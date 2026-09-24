import React, { useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FieldLabel } from './ui/FieldLabel';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { filterFutureSlots, formatTime, getDisplayHour } from '../utils/format';

type Slot = { start_at: string };

type Props = {
  slots: Slot[];
  selected?: string;
  onSelect: (startAt: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  error?: string;
  label?: string;
};

const COLUMNS = 4;
const GAP = spacing.sm;

type PeriodKey = 'morning' | 'afternoon' | 'evening';

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

function periodFor(iso: string): PeriodKey {
  // Use display-zone hour so buckets match formatTime labels (not device local).
  const hour = getDisplayHour(iso);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  emptyMessage = 'No timeslot available for this date. Try another day or staff member.',
  error,
  label = 'Available times',
}: Props) {
  const [gridWidth, setGridWidth] = useState(0);
  const slotWidth = gridWidth > 0 ? (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;
  const openSlots = useMemo(() => filterFutureSlots(slots), [slots]);
  const grouped = useMemo(() => {
    const buckets: Record<PeriodKey, Slot[]> = { morning: [], afternoon: [], evening: [] };
    openSlots.forEach((slot) => buckets[periodFor(slot.start_at)].push(slot));
    return buckets;
  }, [openSlots]);

  function onGridLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== gridWidth) setGridWidth(next);
  }

  const visiblePeriods = PERIODS.filter((period) => grouped[period.key].length > 0);

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.meta}>Finding open times…</Text>
        </View>
      ) : openSlots.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="clock" size={18} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.groups} onLayout={onGridLayout}>
          {visiblePeriods.map((period) => (
            <View key={period.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{period.label}</Text>
                <Text style={styles.groupCount}>{grouped[period.key].length}</Text>
              </View>
              <View style={styles.grid}>
                {grouped[period.key].map((slot) => {
                  const active = selected === slot.start_at;
                  return (
                    <Pressable
                      key={slot.start_at}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.slot,
                        slotWidth != null ? { width: slotWidth } : styles.slotFallback,
                        active && styles.slotActive,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => onSelect(slot.start_at)}
                    >
                      <Text style={[styles.slotText, active && styles.slotTextActive]} numberOfLines={1}>
                        {formatTime(slot.start_at)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  groups: { gap: spacing.lg },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitle: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: { ...typography.tiny, color: colors.mutedForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  slot: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  slotFallback: { width: `${100 / COLUMNS}%` },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.9 },
  slotText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  slotTextActive: { color: colors.accentForeground },
  meta: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  error: { ...typography.caption, color: colors.destructive },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyText: { ...typography.caption, color: colors.mutedForeground, flex: 1, lineHeight: 18 },
});
