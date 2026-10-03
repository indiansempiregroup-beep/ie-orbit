import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, typography } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
type Size = 'sm' | 'md' | 'lg';
type IconName = keyof typeof Feather.glyphMap;

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  primaryColor?: string;
  /** Leading icon. Omit to auto-infer on primary/destructive; pass `null` to force no icon. */
  icon?: IconName | null;
};

function inferIcon(label: string): IconName | undefined {
  const text = label.trim().toLowerCase().replace(/…$/, '').replace(/\.\.\.$/, '').trim();
  if (!text) return undefined;
  if (/\b(save|update|confirm|done|apply)\b/.test(text)) return 'check';
  if (/\b(add|new|create)\b/.test(text)) return 'plus';
  if (/\b(continue|next|buy now)\b/.test(text)) return 'arrow-right';
  if (/\bedit\b/.test(text)) return 'edit-2';
  if (/\b(share|print|view)\b/.test(text)) return 'share-2';
  if (/\b(send|submit)\b/.test(text)) return 'send';
  if (/\b(payment|pay|paid)\b/.test(text)) return 'credit-card';
  if (/\breschedule\b/.test(text) || /\bschedule\b/.test(text)) return 'calendar';
  if (/\bcancel\b/.test(text)) return 'x-circle';
  if (/\breturn\b/.test(text)) return 'rotate-ccw';
  if (/\binvoice\b/.test(text) || /\bbill\b/.test(text)) return 'file-text';
  if (/\b(add to cart|cart)\b/.test(text)) return 'shopping-cart';
  if (/\baddress\b/.test(text)) return 'map-pin';
  if (/\bpreferences\b/.test(text)) return 'check';
  if (/\bpet\b/.test(text)) return 'heart';
  return undefined;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  primaryColor = colors.primary,
  icon,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyle(variant, primaryColor);
  const sizeStyle = sizes[size];
  const resolvedIcon =
    icon === null ? undefined : icon ?? (variant === 'primary' || variant === 'destructive' ? inferIcon(label) : undefined);
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

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
        <View style={styles.content}>
          {resolvedIcon ? <Feather name={resolvedIcon} size={iconSize} color={variantStyle.icon} /> : null}
          <Text style={[styles.label, variantStyle.label, sizeStyles[size]]} numberOfLines={1}>
            {label}
          </Text>
        </View>
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
        icon: colors.secondaryForeground,
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
    case 'destructive':
      return {
        container: { backgroundColor: colors.destructive },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
    default:
      return {
        container: { backgroundColor: primaryColor },
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
  }
}

const sizes: Record<Size, ViewStyle> = {
  sm: { minHeight: 32, paddingHorizontal: 12 },
  md: { minHeight: 44, paddingHorizontal: 14 },
  lg: { minHeight: 48, paddingHorizontal: 18 },
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  fullWidth: { width: '100%' },
  label: { ...typography.label, fontWeight: '700', flexShrink: 1 },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
});
