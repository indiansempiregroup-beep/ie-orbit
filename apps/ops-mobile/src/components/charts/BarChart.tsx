import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, fonts, typography } from '../../theme/tokens';
import { ChartReadout, ChartTooltip } from './ChartTooltip';
import { chartPointerProps, clamp } from './chartPointer';
import { formatAxisValue } from './chartUtils';

export type BarDatum = { label: string; value: number; highlight?: boolean };

type Props = {
  data: BarDatum[];
  color?: string;
  highlightColor?: string;
  height?: number;
  formatValue?: (value: number) => string;
  unit?: string;
};

export function BarChart({
  data,
  color = colors.primary,
  highlightColor = colors.accent,
  height = 172,
  formatValue = formatAxisValue,
  unit,
}: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(...data.map((row) => row.value), 1);
  const gap = 6;
  const barAreaH = height - 36;
  const barW = data.length && width ? Math.max(8, (width - gap * (data.length - 1)) / data.length) : 0;
    const highlighted = data.findIndex((row) => row.highlight);
    const selectedIndex = activeIndex ?? (highlighted >= 0 ? highlighted : Math.max(0, data.length - 1));
  const selected = data[selectedIndex] ?? data[data.length - 1];
  const selectedX =
    selectedIndex >= 0 && barW ? selectedIndex * (barW + gap) + barW / 2 : width / 2;
  const selectedH = selected
    ? Math.max(selected.value > 0 ? 4 : 0, (selected.value / max) * (barAreaH - 4))
    : 0;

  function indexFromX(x: number) {
    if (!barW || !data.length) return 0;
    const index = Math.floor(x / (barW + gap));
    return clamp(index, 0, data.length - 1);
  }

  const pointer = chartPointerProps(
    (x) => setActiveIndex(indexFromX(x)),
    () => setActiveIndex(null),
  );

  return (
    <View style={styles.wrap}>
      {selected ? (
        <ChartReadout
          label={selected.label}
          value={unit ? `${formatValue(selected.value)} ${unit}` : formatValue(selected.value)}
        />
      ) : null}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...pointer}>
        <View style={{ height: barAreaH }}>
          {width > 0 ? (
            <Svg width={width} height={barAreaH} pointerEvents="none">
              {data.map((row, index) => {
                const h = Math.max(row.value > 0 ? 4 : 0, (row.value / max) * (barAreaH - 4));
                const x = index * (barW + gap);
                const active = index === (activeIndex ?? selectedIndex);
                return (
                  <Rect
                    key={row.label}
                    x={x}
                    y={barAreaH - h}
                    width={barW}
                    height={h}
                    rx={Math.min(6, barW / 2)}
                    fill={row.highlight || active ? highlightColor : color}
                    opacity={activeIndex == null || active ? 1 : 0.35}
                  />
                );
              })}
            </Svg>
          ) : null}
          {selected && width > 0 && activeIndex != null ? (
            <ChartTooltip
              x={selectedX}
              y={barAreaH - selectedH}
              width={width}
              title={selected.label}
              value={formatValue(selected.value)}
            />
          ) : null}
        </View>
        <View style={styles.labels}>
          {data.map((row, index) => (
            <View key={row.label} style={[styles.labelCol, { width: barW || undefined, flex: barW ? undefined : 1 }]}>
              <Text
                style={[
                  styles.label,
                  (row.highlight || index === activeIndex) && styles.labelActive,
                ]}
                numberOfLines={1}
              >
                {row.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 8 },
  labelCol: { alignItems: 'center' },
  label: { ...typography.tiny, color: colors.mutedForeground, fontFamily: fonts.bodyMedium },
  labelActive: { color: colors.foreground, fontFamily: fonts.bodySemi },
});
