import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { spacing } from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
  /** Fixed column count. Defaults to 2 on phone, 4 on desktop. */
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Stable multi-column grid for RN.
 * Avoids % minWidth + gap (which overlaps / wraps badly on iOS).
 * Lays out explicit rows of equal flex children.
 */
export function TileGrid({ children, columns, gap = spacing.sm, style }: Props) {
  const { isDesktop } = useBreakpoint();
  const cols = columns ?? (isDesktop ? 4 : 2);

  const rows = useMemo(() => {
    const items = React.Children.toArray(children).filter(Boolean);
    const next: React.ReactNode[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      next.push(items.slice(i, i + cols));
    }
    return next;
  }, [children, cols]);

  return (
    <View style={[styles.wrap, { gap }, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { gap }]}>
          {row.map((child, index) => (
            <View key={index} style={styles.cell}>
              {child}
            </View>
          ))}
          {row.length < cols
            ? Array.from({ length: cols - row.length }, (_, index) => (
                <View key={`pad-${index}`} style={styles.cell} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1, minWidth: 0 },
});
