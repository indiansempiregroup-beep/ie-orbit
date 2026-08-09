import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { useWorkspace } from '../contexts/WorkspaceContext';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
};

/** Flat white header (Vyapar-style) with Deep Navy accents. */
export function OpsHeader({ title, subtitle, right, children, compact }: Props) {
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useWorkspace();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.md },
        compact && styles.compact,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.kicker}>{activeBusiness?.display_name ?? brand.appName}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function OpsHeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <Feather name={icon} size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.headerBorder,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  compact: { paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 2 },
  kicker: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
  },
  subtitle: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    color: colors.foreground,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { opacity: 0.85 },
});
