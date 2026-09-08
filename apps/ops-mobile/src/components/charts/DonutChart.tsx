import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, radius, typography } from '../../theme/tokens';
import { ChartReadout } from './ChartTooltip';
import { chartPointerProps } from './chartPointer';
import { donutSlicePath, formatAxisValue } from './chartUtils';

export type DonutSlice = { label: string; value: number; color: string };

type SliceGeom = DonutSlice & { path: string; start: number; end: number };

type Props = {
  data: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (value: number) => string;
};

export function DonutChart({
  data,
  size = 148,
  centerLabel,
  centerValue,
  formatValue = formatAxisValue,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = data.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const inner = outer * 0.62;

  const slices: SliceGeom[] = useMemo(() => {
    if (total <= 0) {
      return [
        {
          label: 'None',
          value: 0,
          color: colors.muted,
          path: donutSlicePath(cx, cy, outer, inner, 0, 359.999),
          start: 0,
          end: 360,
        },
      ];
    }
    let angle = 0;
    return data
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const sweep = (slice.value / total) * 360;
        const start = angle;
        const end = angle + sweep;
        const path = donutSlicePath(cx, cy, outer, inner, start, end);
        angle = end;
        return { ...slice, path, start, end };
      });
  }, [cx, cy, data, inner, outer, total]);

  const selected = activeIndex != null ? slices[activeIndex] : null;
  const displayValue = selected ? formatValue(selected.value) : centerValue ?? formatValue(total);
  const displayLabel = selected
    ? selected.label
    : centerLabel ?? 'total';
  const share =
    selected && total > 0 ? `${Math.round((selected.value / total) * 100)}%` : null;

  function indexFromPoint(x: number, y: number) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < inner - 4 || dist > outer + 8) return null;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const index = slices.findIndex((slice) => deg >= slice.start && deg <= slice.end);
    return index >= 0 ? index : slices.length - 1;
  }

  const pointer = chartPointerProps(
    (x, y) => {
      const index = indexFromPoint(x, y);
      setActiveIndex(index);
    },
    () => setActiveIndex(null),
  );

  return (
    <View style={styles.block}>
      <ChartReadout
        label={selected ? `${selected.label}${share ? ` · ${share}` : ''}` : 'Total'}
        value={selected ? formatValue(selected.value) : formatValue(total)}
      />
      <View style={styles.row}>
        <View style={{ width: size, height: size }} {...pointer}>
          <Svg width={size} height={size} pointerEvents="none">
            {slices.map((slice, index) => (
              <Path
                key={`${slice.label}-${index}`}
                d={slice.path}
                fill={slice.color}
                opacity={activeIndex == null || activeIndex === index ? 1 : 0.32}
              />
            ))}
          </Svg>
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.centerValue} numberOfLines={1}>
              {displayValue}
            </Text>
            <Text style={styles.centerLabel} numberOfLines={1}>
              {displayLabel}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {slices.map((slice, index) => (
            <Pressable
              key={slice.label}
              onPressIn={() => setActiveIndex(index)}
              onPressOut={() => setActiveIndex(null)}
              onHoverIn={() => setActiveIndex(index)}
              onHoverOut={() => setActiveIndex(null)}
              style={[styles.legendRow, activeIndex === index && styles.legendActive]}
            >
              <View style={[styles.swatch, { backgroundColor: slice.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {slice.label}
              </Text>
              <Text style={styles.legendValue}>{formatValue(slice.value)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: { ...typography.title, fontSize: 18, color: colors.foreground },
  centerLabel: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2, maxWidth: 88, textAlign: 'center' },
  legend: { flex: 1, gap: 6, minWidth: 0 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  legendActive: { backgroundColor: colors.tint },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...typography.caption, color: colors.foreground, flex: 1 },
  legendValue: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
});
