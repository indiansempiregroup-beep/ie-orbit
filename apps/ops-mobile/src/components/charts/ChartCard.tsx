import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onPress?: () => void;
  actionLabel?: string;
};

export function ChartCard({ title, subtitle, children, onPress, actionLabel = 'Details' }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onPress ? (
          <Pressable
            onPress={onPress}
            hitSlop={8}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  title: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  subtitle: { ...typography.caption, color: colors.mutedForeground },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  actionText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
});
