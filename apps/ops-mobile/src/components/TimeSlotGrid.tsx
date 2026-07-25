import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';
import { formatTime } from '../utils/format';

type Slot = { start_at: string };

type Props = {
  slots: Slot[];
  selected?: string;
  onSelect: (startAt: string) => void;
  loading?: boolean;
  emptyMessage?: string;
};

const COLUMNS = 4;
const GAP = spacing.sm;

export function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  emptyMessage = 'No timeslot available for this date. Try another day or staff member.',
}: Props) {
  const [gridWidth, setGridWidth] = useState(0);
  const slotWidth = gridWidth > 0 ? (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;

  function onGridLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== gridWidth) setGridWidth(next);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid} onLayout={onGridLayout}>
        {slots.map((slot) => {
          const active = selected === slot.start_at;
          return (
            <Pressable
              key={slot.start_at}
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
      {loading ? <Text style={styles.meta}>Loading available times…</Text> : null}
      {!loading && !slots.length ? <Text style={styles.meta}>{emptyMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  slot: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
  },
  slotFallback: { width: `${100 / COLUMNS}%` },
  slotActive: { backgroundColor: colors.accent, ...shadows.soft },
  pressed: { opacity: 0.9 },
  slotText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  slotTextActive: { color: colors.accentForeground },
  meta: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
