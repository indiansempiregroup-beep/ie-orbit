import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, fonts, spacing, typography } from '../theme/tokens';
import { useWorkspace } from '../contexts/WorkspaceContext';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
};

export function OpsHeader({ title, subtitle, right, children, compact }: Props) {
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useWorkspace();

  return (
    <LinearGradient
      colors={[brand.primary, brand.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + spacing.md }, compact && styles.compact]}
    >
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.kicker}>{activeBusiness?.display_name ?? brand.appName}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  compact: { paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 4 },
  kicker: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.primaryForeground,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.88)',
  },
});
