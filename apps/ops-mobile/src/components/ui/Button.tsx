import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius, typography } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyle(variant);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyle.container,
        sizes[size],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.spinner} size="small" />
      ) : (
        <Text style={[styles.label, variantStyle.label, sizeStyles[size]]}>{label}</Text>
      )}
    </Pressable>
  );
}

function getVariantStyle(variant: Variant) {
  switch (variant) {
    case 'secondary':
      return {
        container: { backgroundColor: colors.secondary },
        label: { color: colors.secondaryForeground },
        spinner: colors.secondaryForeground,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' },
        label: { color: colors.foreground },
        spinner: colors.foreground,
      };
    case 'outline':
      return {
        container: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        label: { color: colors.foreground },
        spinner: colors.foreground,
      };
    case 'destructive':
      return {
        container: { backgroundColor: colors.destructive },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
      };
    default:
      return {
        container: { backgroundColor: colors.accent },
        label: { color: colors.accentForeground },
        spinner: colors.accentForeground,
      };
  }
}

const sizes: Record<Size, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 14 },
  md: { minHeight: 46, paddingHorizontal: 18 },
  lg: { minHeight: 52, paddingHorizontal: 22 },
};

const sizeStyles: Record<Size, TextStyle> = {
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 16 },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { width: '100%' },
  label: { ...typography.label, fontFamily: fonts.bodySemi },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
