import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconBadge } from './IconBadge';
import { toneForMenuIcon } from '../../theme/menuIconTones';
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

export function MenuRow({ icon, label, onPress, destructive, subtitle, last, tone }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}
      onPress={onPress}
    >
      <IconBadge icon={icon} tone={tone ?? toneForMenuIcon(icon, destructive)} />
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
