import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatTime } from '../utils/format';

type Slot = { start_at: string };

type Props = {
  slots: Slot[];
  selected?: string;
  onSelect: (startAt: string) => void;
  loading?: boolean;
  emptyMessage?: string;
};

export function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  emptyMessage = 'No slots for this date. Try another day or staff member.',
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {slots.map((slot) => {
          const active = selected === slot.start_at;
          return (
            <Pressable
              key={slot.start_at}
              style={[styles.slot, active && styles.slotActive]}
              onPress={() => onSelect(slot.start_at)}
            >
              <Text style={[styles.slotText, active && styles.slotTextActive]}>{formatTime(slot.start_at)}</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  slotTextActive: { color: colors.primaryForeground },
  meta: { ...typography.caption, color: colors.mutedForeground },
});
