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
import { colors, radius, typography } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  primaryColor?: string;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  primaryColor = colors.primary,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyle(variant, primaryColor);
  const sizeStyle = sizes[size];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyle.container,
        sizeStyle,
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

function getVariantStyle(variant: Variant, primaryColor: string) {
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
        container: { backgroundColor: primaryColor },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
      };
  }
}

const sizes: Record<Size, ViewStyle> = {
  sm: { minHeight: 32, paddingHorizontal: 12 },
  md: { minHeight: 40, paddingHorizontal: 16 },
  lg: { minHeight: 48, paddingHorizontal: 20 },
};

const sizeStyles: Record<Size, TextStyle> = {
  sm: { fontSize: 12 },
  md: { fontSize: 14 },
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
  label: { ...typography.label, fontWeight: '600' },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
});
