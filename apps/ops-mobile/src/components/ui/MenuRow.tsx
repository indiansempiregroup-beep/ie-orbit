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
};

export function MenuRow({ icon, label, onPress, destructive, subtitle }: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.icon, destructive && styles.iconDestructive]}>
        <Feather name={icon} size={16} color={destructive ? colors.destructive : colors.mutedForeground} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDestructive: { backgroundColor: '#FEE2E2' },
  copy: { flex: 1 },
  label: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  subtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  destructive: { color: colors.destructive },
});
