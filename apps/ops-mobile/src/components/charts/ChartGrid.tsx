import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { spacing } from '../../theme/tokens';

export function ChartGrid({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useBreakpoint();
  const items = React.Children.toArray(children).filter(Boolean);
  if (!isDesktop) {
    return <View style={styles.stack}>{items}</View>;
  }
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return (
    <View style={styles.stack}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.desktopRow}>
          {row.map((child, index) => (
            <View key={index} style={styles.desktopCell}>
              {child}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.desktopCell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  desktopRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  desktopCell: { flex: 1, minWidth: 0 },
});
