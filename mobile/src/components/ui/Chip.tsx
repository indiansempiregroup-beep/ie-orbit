import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, typography } from '../../theme/tokens';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  primaryColor?: string;
};

export function Chip({ label, active, onPress, primaryColor = colors.primary }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active ? { backgroundColor: primaryColor, borderColor: primaryColor } : null,
      ]}
    >
      <Text style={[styles.label, active ? styles.labelActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  label: { ...typography.caption, color: colors.mutedForeground, fontWeight: '500' },
  labelActive: { color: colors.primaryForeground },
});
