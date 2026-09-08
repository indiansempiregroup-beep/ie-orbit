import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadows, typography } from '../../theme/tokens';
import { clamp } from './chartPointer';

type Props = {
  x: number;
  y: number;
  width: number;
  title: string;
  value: string;
};

export function ChartTooltip({ x, y, width, title, value }: Props) {
  const left = clamp(x - 56, 4, Math.max(4, width - 116));
  const top = Math.max(0, y - 52);
  return (
    <View style={[styles.tip, { left, top }]} pointerEvents="none">
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ChartReadout({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.readoutValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    minWidth: 88,
    maxWidth: 140,
    backgroundColor: colors.foreground,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 4,
    ...shadows.soft,
  },
  title: { ...typography.tiny, color: 'rgba(255,255,255,0.72)' },
  value: { ...typography.caption, fontFamily: fonts.bodySemi, color: '#fff', marginTop: 1 },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  readoutLabel: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  readoutValue: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
});
