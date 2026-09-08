import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatDateKey } from '../utils/format';

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  primaryColor?: string;
  days?: number;
};

function addDays(from: Date, days: number) {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
}

export function DateStrip({ value, onChange, primaryColor = colors.primary, days = 14 }: Props) {
  const items = useMemo(() => {
    const today = new Date();
    return Array.from({ length: days }, (_, offset) => {
      const day = addDays(today, offset);
      const key = formatDateKey(day);
      const label =
        offset === 0
          ? 'Today'
          : offset === 1
            ? 'Tomorrow'
            : day.toLocaleDateString(undefined, { weekday: 'short' });
      return {
        key,
        label,
        dayNumber: day.getDate(),
        month: day.toLocaleDateString(undefined, { month: 'short' }),
      };
    });
  }, [days]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const active = item.key === value;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(item.key)}
              style={[
                styles.day,
                active && { backgroundColor: primaryColor, borderColor: primaryColor },
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.number, active && styles.numberActive]}>{item.dayNumber}</Text>
              <Text style={[styles.month, active && styles.monthActive]}>{item.month}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const DAY_WIDTH = 72;
const DAY_HEIGHT = 84;

const styles = StyleSheet.create({
  wrap: { height: DAY_HEIGHT },
  scroll: { flexGrow: 0, height: DAY_HEIGHT },
  row: { gap: spacing.sm, alignItems: 'stretch', paddingRight: spacing.xs },
  day: {
    width: DAY_WIDTH,
    height: DAY_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  label: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '600' },
  labelActive: { color: colors.primaryForeground },
  number: { ...typography.title, fontSize: 20, color: colors.foreground, marginTop: 4 },
  numberActive: { color: colors.primaryForeground },
  month: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2 },
  monthActive: { color: colors.primaryForeground, opacity: 0.9 },
});
