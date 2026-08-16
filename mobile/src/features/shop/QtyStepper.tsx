import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, typography } from '../../theme/tokens';

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  primaryColor?: string;
  size?: 'sm' | 'md';
};

export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  primaryColor = colors.primary,
  size = 'md',
}: Props) {
  const compact = size === 'sm';
  const dim = compact ? 28 : 36;
  const canDec = value > min;
  const canInc = max == null || value < max;

  return (
    <View style={[styles.wrap, compact && styles.wrapSm, { borderColor: primaryColor }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        hitSlop={6}
        disabled={!canDec}
        onPress={() => canDec && onChange(value - 1)}
        style={[styles.btn, { width: dim, height: dim }, !canDec && styles.disabled]}
      >
        <Feather name={value - 1 <= min && min === 0 ? 'trash-2' : 'minus'} size={compact ? 13 : 15} color={primaryColor} />
      </Pressable>
      <Text style={[styles.value, compact && styles.valueSm]}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        hitSlop={6}
        disabled={!canInc}
        onPress={() => canInc && onChange(value + 1)}
        style={[styles.btn, { width: dim, height: dim, backgroundColor: primaryColor }, !canInc && styles.disabled]}
      >
        <Feather name="plus" size={compact ? 13 : 15} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  wrapSm: { borderRadius: radius.sm },
  btn: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  value: {
    ...typography.label,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
    color: colors.foreground,
  },
  valueSm: { minWidth: 22, fontSize: 12 },
});
