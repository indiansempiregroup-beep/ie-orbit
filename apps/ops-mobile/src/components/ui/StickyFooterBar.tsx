import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows, spacing } from '../../theme/tokens';

type Props = ViewProps & {
  children: React.ReactNode;
};

/** Bottom action bar for POS / forms (Vyapar sticky footer pattern). */
export function StickyFooterBar({ children, style, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        shadows.soft,
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
