import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
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
  showWorkspace?: boolean;
};

/** Branded customer-style gradient header shared by primary ops destinations. */
export function OpsHeader({ title, subtitle, right, children, compact, showWorkspace = true }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { activeBusiness } = useWorkspace();
  const { isDesktop } = useBreakpoint();

  return (
    <>
      {isFocused ? <StatusBar style="light" /> : null}
      <LinearGradient
        colors={[brand.gradientStart, brand.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.wrap,
          {
            paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, spacing.sm),
            paddingHorizontal: isDesktop ? layout.desktopGutter : spacing.xl,
            paddingBottom: isDesktop || compact ? spacing.md : spacing.xl,
          },
        ]}
      >
        <View style={isDesktop ? styles.desktopInner : undefined}>
          <View style={styles.row}>
            <View style={styles.copy}>
              {showWorkspace ? (
                <Text style={styles.kicker}>{activeBusiness?.display_name ?? brand.appName}</Text>
              ) : null}
              <Text style={[styles.title, compact && styles.titleCompact, isDesktop && styles.titleDesktop]}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
          {children}
        </View>
      </LinearGradient>
    </>
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
      <Feather name={icon} size={18} color="#FFFFFF" />
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
    backgroundColor: brand.primary,
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
    color: 'rgba(255,255,255,0.72)',
  },
  subtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.82)',
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  titleCompact: { fontSize: 20 },
  titleDesktop: { fontSize: 20 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { backgroundColor: 'rgba(255,255,255,0.26)' },
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
