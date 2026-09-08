import React, { useId, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, fonts, typography } from '../../theme/tokens';
import { ChartReadout, ChartTooltip } from './ChartTooltip';
import { chartPointerProps, clamp } from './chartPointer';
import { formatAxisValue, friendlyDayLabel, linePath, shortDayLabel, type SeriesPoint } from './chartUtils';

type Props = {
  data: SeriesPoint[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  unit?: string;
};

export function LineAreaChart({
  data,
  color = colors.accent,
  height = 176,
  formatValue = formatAxisValue,
  unit,
}: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const pad = { top: 18, right: 10, bottom: 22, left: 36 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((row) => row.value), 1);
  const points = useMemo(() => {
    if (!innerW || data.length < 2) return [];
    return data.map((row, index) => ({
      x: pad.left + (index / Math.max(data.length - 1, 1)) * innerW,
      y: pad.top + innerH - (row.value / max) * innerH,
      value: row.value,
      day: row.day,
    }));
  }, [data, innerH, innerW, max, pad.left, pad.top]);

  const lastIndex = Math.max(0, points.length - 1);
  const selected = points[activeIndex ?? lastIndex];
  const labels = data.length
    ? [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]]
    : [];

  function indexFromX(x: number) {
    if (!innerW || data.length < 2) return lastIndex;
    const ratio = clamp((x - pad.left) / innerW, 0, 1);
    return Math.round(ratio * (data.length - 1));
  }

  const pointer = chartPointerProps(
    (x) => setActiveIndex(indexFromX(x)),
    () => setActiveIndex(null),
  );

  return (
    <View style={styles.wrap}>
      {selected ? (
        <ChartReadout
          label={activeIndex == null ? 'Latest' : friendlyDayLabel(selected.day)}
          value={unit ? `${formatValue(selected.value)} ${unit}` : formatValue(selected.value)}
        />
      ) : null}
      <View
        style={[styles.plot, Platform.OS === 'web' ? ({ cursor: 'crosshair' } as object) : null]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...pointer}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.32" />
                <Stop offset="1" stopColor={color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>
            <Path d={linePath(points, pad.top + innerH)} fill={`url(#${gradientId})`} />
            <Path d={linePath(points)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            {selected ? (
              <>
                {activeIndex != null ? (
                  <Line
                    x1={selected.x}
                    y1={pad.top}
                    x2={selected.x}
                    y2={pad.top + innerH}
                    stroke={color}
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                  />
                ) : null}
                <Circle cx={selected.x} cy={selected.y} r={activeIndex != null ? 5.5 : 4.5} fill={color} />
                {activeIndex != null ? <Circle cx={selected.x} cy={selected.y} r={2.5} fill="#fff" /> : null}
              </>
            ) : null}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
        <View style={[styles.yAxis, { height: innerH, top: pad.top }]} pointerEvents="none">
          <Text style={styles.axis}>{formatValue(max)}</Text>
          <Text style={styles.axis}>{formatValue(max / 2)}</Text>
          <Text style={styles.axis}>0</Text>
        </View>
        <View style={styles.xAxis} pointerEvents="none">
          {labels.map((row) => (
            <Text key={row.day} style={styles.axis}>
              {shortDayLabel(row.day)}
            </Text>
          ))}
        </View>
        {selected && width > 0 && activeIndex != null ? (
          <ChartTooltip
            x={selected.x}
            y={selected.y}
            width={width}
            title={friendlyDayLabel(selected.day)}
            value={formatValue(selected.value)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  plot: { width: '100%', position: 'relative' },
  yAxis: {
    position: 'absolute',
    left: 0,
    justifyContent: 'space-between',
  },
  xAxis: {
    position: 'absolute',
    left: 36,
    right: 8,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axis: { ...typography.tiny, fontFamily: fonts.bodyMedium, color: colors.mutedForeground },
});
