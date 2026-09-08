import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { filterFutureSlots, formatTime } from '../utils/format';

type Slot = { start_at: string };

type Props = {
  slots: Slot[];
  selected?: string;
  onSelect: (startAt: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  error?: string;
  label?: string;
  primaryColor?: string;
};

const COLUMNS = 3;

type PeriodKey = 'morning' | 'afternoon' | 'evening';

const PERIODS: Array<{ key: PeriodKey; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'morning', label: 'Morning', icon: 'coffee' },
  { key: 'afternoon', label: 'Afternoon', icon: 'sun' },
  { key: 'evening', label: 'Evening', icon: 'moon' },
];

function periodFor(iso: string): PeriodKey {
  const hour = new Date(iso).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  emptyMessage = 'No timeslot available for this date. Try another day.',
  error,
  label = 'Available times',
  primaryColor = colors.primary,
}: Props) {
  const openSlots = useMemo(() => filterFutureSlots(slots), [slots]);
  const grouped = useMemo(() => {
    const buckets: Record<PeriodKey, Slot[]> = { morning: [], afternoon: [], evening: [] };
    openSlots.forEach((slot) => buckets[periodFor(slot.start_at)].push(slot));
    return buckets;
  }, [openSlots]);

  const visiblePeriods = PERIODS.filter((period) => grouped[period.key].length > 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && openSlots.length === 0 ? (
        <View style={styles.skeleton}>
          <ActivityIndicator color={primaryColor} />
          <Text style={styles.meta}>Finding open times…</Text>
          <View style={styles.skeletonGrid}>
            {Array.from({ length: 2 }).map((_, rowIndex) => (
              <View key={rowIndex} style={styles.gridRow}>
                {Array.from({ length: 3 }).map((__, colIndex) => (
                  <View key={colIndex} style={styles.skeletonSlot} />
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : openSlots.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="clock" size={18} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={[styles.groups, loading && styles.groupsLoading]}>
          {loading ? (
            <View style={styles.refreshHint}>
              <ActivityIndicator color={primaryColor} size="small" />
              <Text style={styles.meta}>Updating times…</Text>
            </View>
          ) : null}
          {visiblePeriods.map((period) => (
            <View key={period.key} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={styles.groupTitleRow}>
                  <Feather name={period.icon} size={14} color={colors.mutedForeground} />
                  <Text style={styles.groupTitle}>{period.label}</Text>
                </View>
                <Text style={styles.groupCount}>{grouped[period.key].length}</Text>
              </View>
              {chunk(grouped[period.key], COLUMNS).map((row, rowIndex) => (
                <View key={`${period.key}-${rowIndex}`} style={styles.gridRow}>
                  {row.map((slot) => {
                    const active = selected === slot.start_at;
                    return (
                      <Pressable
                        key={slot.start_at}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.slot,
                          active && { backgroundColor: primaryColor, borderColor: primaryColor },
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
                  {row.length < COLUMNS
                    ? Array.from({ length: COLUMNS - row.length }).map((_, index) => (
                        <View key={`pad-${index}`} style={styles.slotSpacer} />
                      ))
                    : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  groups: { gap: spacing.lg },
  groupsLoading: { opacity: 0.55 },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  groupTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: { ...typography.tiny, color: colors.mutedForeground },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  slot: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  slotSpacer: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.9 },
  slotText: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  slotTextActive: { color: colors.primaryForeground },
  meta: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  error: { ...typography.caption, color: colors.destructive },
  refreshHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeleton: { gap: spacing.md },
  skeletonGrid: { gap: spacing.sm },
  skeletonSlot: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
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
