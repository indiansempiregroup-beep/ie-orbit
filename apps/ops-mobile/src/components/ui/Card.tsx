import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

type Props = ViewProps & { padded?: boolean };

export function Card({ children, style, padded = true, ...rest }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  padded: { padding: spacing.xl },
});
