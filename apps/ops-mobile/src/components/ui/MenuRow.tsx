import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  subtitle?: string;
  last?: boolean;
};

export function MenuRow({ icon, label, onPress, destructive, subtitle, last }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.icon, destructive && styles.iconDestructive]}>
        <Feather name={icon} size={16} color={destructive ? colors.destructive : colors.primary} />
      </View>
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
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDestructive: { backgroundColor: colors.destructiveSoft },
  copy: { flex: 1, minWidth: 0 },
  label: { ...typography.body, color: colors.foreground, fontFamily: typography.label.fontFamily, fontWeight: '600' },
  subtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  destructive: { color: colors.destructive },
});
