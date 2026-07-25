import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

type Props = ViewProps & {
  padded?: boolean;
  elevated?: boolean;
  bordered?: boolean;
};

export function Card({ children, style, padded = true, elevated = false, bordered = true, ...rest }: Props) {
  return (
    <View
      style={[
        styles.card,
        bordered && styles.bordered,
        elevated && shadows.soft,
        padded && styles.padded,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: spacing.xl },
});
