import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { layout } from '../theme/layout';
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
  const { isDesktop } = useBreakpoint();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: isDesktop ? spacing.lg : insets.top + spacing.md,
          paddingHorizontal: isDesktop ? layout.desktopGutter : spacing.xl,
          paddingBottom: isDesktop || compact ? spacing.lg : spacing.xxl,
        },
      ]}
    >
      <View style={isDesktop ? styles.desktopInner : undefined}>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>{activeBusiness?.display_name ?? brand.appName}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <Text style={[styles.title, isDesktop && styles.titleDesktop]}>{title}</Text>
          </View>
          {right}
        </View>
        {children}
      </View>
    </View>
  );
}

export function OpsHeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
  badge?: number;
}) {
  const showBadge = typeof badge === 'number' && badge > 0;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <Feather name={icon} size={18} color={colors.primary} />
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.headerBorder,
  },
  desktopInner: {
    width: '100%',
    maxWidth: layout.pageMaxWidth,
    alignSelf: 'center',
  },
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
  titleDesktop: { fontSize: 22 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { opacity: 0.85 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: fonts.bodyBold,
    lineHeight: 11,
  },
});
