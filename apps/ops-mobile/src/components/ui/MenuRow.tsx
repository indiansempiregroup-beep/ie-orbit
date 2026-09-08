import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconBadge } from './IconBadge';
import { colors, spacing, typography, type IconTone } from '../../theme/tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  subtitle?: string;
  last?: boolean;
  tone?: IconTone;
};

const iconTone: Partial<Record<keyof typeof Feather.glyphMap, IconTone>> = {
  calendar: 'blue',
  'book-open': 'violet',
  layers: 'violet',
  'shopping-cart': 'green',
  'shopping-bag': 'green',
  package: 'amber',
  home: 'amber',
  truck: 'coral',
  users: 'cyan',
  user: 'cyan',
  'user-check': 'green',
  heart: 'rose',
  star: 'amber',
  bell: 'coral',
  'bar-chart-2': 'violet',
  'map-pin': 'coral',
  'message-circle': 'green',
  globe: 'blue',
  'share-2': 'cyan',
  tool: 'amber',
  image: 'rose',
  tag: 'coral',
  'credit-card': 'violet',
  'dollar-sign': 'green',
  file: 'blue',
  'file-text': 'blue',
  clipboard: 'violet',
  award: 'amber',
  percent: 'green',
  'rotate-ccw': 'coral',
  list: 'blue',
  settings: 'navy',
  shield: 'navy',
  gift: 'rose',
};

export function MenuRow({ icon, label, onPress, destructive, subtitle, last, tone }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}
      onPress={onPress}
    >
      <IconBadge icon={icon} tone={destructive ? 'rose' : tone ?? iconTone[icon] ?? 'blue'} />
      <View style={styles.copy}>
        <Text style={[styles.label, destructive && styles.destructive]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  pressed: { backgroundColor: colors.tint },
  copy: { flex: 1, minWidth: 0 },
  label: { ...typography.body, color: colors.foreground, fontFamily: typography.label.fontFamily, fontWeight: '600' },
  subtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  destructive: { color: colors.destructive },
});
