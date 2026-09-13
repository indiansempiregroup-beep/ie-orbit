import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, typography } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'soft' | 'cta';
type Size = 'sm' | 'md' | 'lg';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  /** Opens in a new tab on web (native `<a>`), or via Linking on native. */
  href?: string;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  icon,
  disabled,
  style,
  href,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyle(variant);
  const inner = loading ? (
    <ActivityIndicator color={variantStyle.spinner} size="small" />
  ) : (
    <View style={styles.content}>
      {icon ? <Feather name={icon} size={size === 'sm' ? 14 : 16} color={variantStyle.icon} /> : null}
      <Text style={[styles.label, variantStyle.label, sizeStyles[size]]}>{label}</Text>
    </View>
  );
  const visualStyle = [
    styles.base,
    variantStyle.container,
    sizes[size],
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
    style as ViewStyle,
  ];

  if (href && Platform.OS === 'web') {
    return (
      <a
        href={isDisabled ? undefined : href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: fullWidth ? 'block' : 'inline-block' }}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }
          onPress?.(event as never);
        }}
      >
        <Pressable disabled pointerEvents="none" style={visualStyle}>
          {inner}
        </Pressable>
      </a>
    );
  }

  return (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      disabled={isDisabled}
      style={({ pressed }) => [...visualStyle, pressed && !isDisabled && styles.pressed]}
      onPress={(event) => {
        if (href) {
          void Linking.openURL(href);
        }
        onPress?.(event);
      }}
      {...rest}
    >
      {inner}
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
        icon: colors.secondaryForeground,
      };
    case 'soft':
      return {
        container: { backgroundColor: colors.tint },
        label: { color: colors.primary },
        spinner: colors.primary,
        icon: colors.primary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' },
        label: { color: colors.foreground },
        spinner: colors.foreground,
        icon: colors.foreground,
      };
    case 'outline':
      return {
        container: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        label: { color: colors.foreground },
        spinner: colors.foreground,
        icon: colors.foreground,
      };
    case 'cta':
      return {
        container: { backgroundColor: colors.primary },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
    case 'destructive':
      return {
        container: { backgroundColor: colors.destructive },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
    default:
      return {
        container: { backgroundColor: colors.primary },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
  }
}

const sizes: Record<Size, ViewStyle> = {
  sm: { minHeight: 32, paddingHorizontal: 14 },
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
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fullWidth: { width: '100%' },
  label: { ...typography.label, fontFamily: fonts.bodySemi },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.45 },
});
