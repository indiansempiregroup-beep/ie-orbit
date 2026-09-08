import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
};

/** Side-by-side fields that wrap on narrow screens. */
export function FieldRow({ children }: Props) {
  return (
    <View style={styles.row}>
      {React.Children.map(children, (child) =>
        child == null ? null : <View style={styles.cell}>{child}</View>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    flexGrow: 1,
    flexBasis: 148,
    minWidth: 148,
  },
});
