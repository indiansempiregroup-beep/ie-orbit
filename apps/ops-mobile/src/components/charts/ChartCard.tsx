import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HelpModal } from '../ui/HelpModal';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  /** Plain-language explanation shown when user taps the ? icon */
  help?: string;
  children: React.ReactNode;
  onPress?: () => void;
  actionLabel?: string;
};

export function ChartCard({ title, subtitle, help, children, onPress, actionLabel = 'Details' }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {help ? (
              <Pressable
                onPress={() => setHelpOpen(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`About ${title}`}
                style={styles.helpBtn}
              >
                <Text style={styles.helpBtnText}>?</Text>
              </Pressable>
            ) : null}
          </View>
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

      {help ? (
        <HelpModal visible={helpOpen} title={title} body={help} onClose={() => setHelpOpen(false)} />
      ) : null}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground, flexShrink: 1 },
  helpBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 14,
  },
  subtitle: { ...typography.caption, color: colors.mutedForeground },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  actionText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
});
