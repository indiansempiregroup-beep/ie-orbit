import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { iconTones, radius, type IconTone } from '../../theme/tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  tone?: IconTone;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const dimensions = { sm: 32, md: 40, lg: 52 } as const;
const iconSizes = { sm: 14, md: 18, lg: 22 } as const;

export function IconBadge({
  icon,
  tone = 'blue',
  size = 'md',
  style,
  accessibilityLabel,
}: Props) {
  const palette = iconTones[tone];
  const dimension = dimensions[size];

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[
        styles.badge,
        {
          width: dimension,
          height: dimension,
          borderRadius: size === 'lg' ? radius.lg : radius.md,
          backgroundColor: palette.background,
        },
        style,
      ]}
    >
      <Feather name={icon} size={iconSizes[size]} color={palette.foreground} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
