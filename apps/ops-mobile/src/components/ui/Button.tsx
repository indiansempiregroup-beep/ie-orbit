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
import { brand, colors, fonts, radius } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'soft' | 'cta';
type Size = 'sm' | 'md' | 'lg';
type IconName = keyof typeof Feather.glyphMap;

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  /** Leading icon. Omit to auto-infer on primary/cta; pass `null` to force no icon. */
  icon?: IconName | null;
  /** Feather glyph rendered after the label (e.g. share / external-link). */
  trailingIcon?: IconName;
  /** Opens in a new tab on web (native `<a>`), or via Linking on native. */
  href?: string;
};

function inferPrimaryIcon(label: string): IconName | undefined {
  const raw = label.trim().toLowerCase();
  if (!raw) return undefined;
  const text = raw.replace(/…$/, '').replace(/\.\.\.$/, '').trim();

  if (/^(add|new)\b/.test(text) || /\bcreate\b/.test(text)) return 'plus';
  if (/\b(save|update|record|apply|confirm|done|got it)\b/.test(text)) return 'check';
  if (/\b(continue|next|open)\b/.test(text)) return 'arrow-right';
  if (/\bedit\b/.test(text)) return 'edit-2';
  if (/\b(share|print|view)\b/.test(text)) return 'share-2';
  if (/\bgenerate\b/.test(text)) return 'file-text';
  if (/\b(send|submit|reply)\b/.test(text)) return 'send';
  if (/\bwhatsapp\b/.test(text)) return 'message-circle';
  if (/\b(payment|paid|qr)\b/.test(text)) return 'credit-card';
  if (/\bassign\b/.test(text)) return 'link';
  if (/\bcomplete\b/.test(text)) return 'check-circle';
  if (/\breactivat/.test(text) || /\brefresh\b/.test(text)) return 'refresh-cw';
  if (/\bdeactivat/.test(text)) return 'slash';
  if (/\bbuild\b/.test(text)) return 'package';
  if (/\b(sign in|verify|accept)\b/.test(text)) return 'log-in';
  if (/\binvit/.test(text)) return 'mail';
  if (/\badjust\b/.test(text)) return 'sliders';
  if (/\btransfer\b/.test(text)) return 'repeat';
  if (/\bstart\b/.test(text)) return 'play';
  if (/\b(preview|see how)\b/.test(text)) return 'eye';
  if (/\breschedule\b/.test(text) || /\breassignment\b/.test(text)) return 'calendar';
  if (/\bnote\b/.test(text)) return 'edit-3';
  if (/\bcoupon\b/.test(text)) return 'tag';
  if (/\bproduct\b/.test(text)) return 'package';
  if (/\bstock\b/.test(text)) return 'layers';
  if (/\breturn\b/.test(text)) return 'rotate-ccw';
  if (/\bbill\b/.test(text) || /\binvoice\b/.test(text)) return 'file-text';
  if (/\btemplate/.test(text)) return 'layout';
  if (/\bschedule\b/.test(text) || /\bleave\b/.test(text) || /\bwindow\b/.test(text) || /\bblock\b/.test(text) || /\bemergency\b/.test(text)) {
    return 'calendar';
  }
  if (/\bextras?\b/.test(text) || /\breward\b/.test(text) || /\bcompliance\b/.test(text) || /\bdelivery\b/.test(text) || /\bpreferences\b/.test(text)) {
    return 'check';
  }
  if (/\bworking\b/.test(text) || /\bsaving\b/.test(text) || /\bprocessing\b/.test(text) || /\bgenerating\b/.test(text) || /\bsubmitting\b/.test(text)) {
    return 'check';
  }
  return 'check';
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  icon,
  trailingIcon,
  disabled,
  style,
  href,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary' || variant === 'cta';
  const variantStyle = getVariantStyle(variant);
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  const resolvedIcon =
    icon === null ? undefined : icon ?? (isPrimary ? inferPrimaryIcon(label) : undefined);
  const inner = loading ? (
    <ActivityIndicator color={variantStyle.spinner} size="small" />
  ) : (
    <View style={styles.content}>
      {resolvedIcon ? <Feather name={resolvedIcon} size={iconSize} color={variantStyle.icon} /> : null}
      <Text style={[styles.label, variantStyle.label, sizeStyles[size]]}>{label}</Text>
      {trailingIcon ? <Feather name={trailingIcon} size={iconSize} color={variantStyle.icon} /> : null}
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
      style={({ pressed }) => [
        ...visualStyle,
        pressed && !isDisabled && (isPrimary ? styles.pressedPrimary : styles.pressed),
      ]}
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
        container: {
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.borderStrong,
        },
        label: { color: colors.foreground },
        spinner: colors.foreground,
        icon: colors.foreground,
      };
    case 'cta':
      return {
        container: styles.primaryFill,
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
        container: styles.primaryFill,
        label: { color: colors.primaryForeground },
        spinner: colors.primaryForeground,
        icon: colors.primaryForeground,
      };
  }
}

const sizes: Record<Size, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 14 },
  md: { minHeight: 44, paddingHorizontal: 16 },
  lg: { minHeight: 50, paddingHorizontal: 20 },
};

const sizeStyles: Record<Size, TextStyle> = {
  sm: { fontSize: 13, lineHeight: 18 },
  md: { fontSize: 15, lineHeight: 20 },
  lg: { fontSize: 16, lineHeight: 22 },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryFill: {
    backgroundColor: colors.primary,
    shadowColor: '#0e2f3a',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullWidth: { width: '100%' },
  label: {
    fontFamily: fonts.body,
    fontWeight: '400',
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  pressed: { opacity: 0.88 },
  pressedPrimary: {
    backgroundColor: brand.primaryHover,
    opacity: 1,
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  disabled: { opacity: 0.4 },
});
