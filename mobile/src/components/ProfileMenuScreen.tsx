import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshableScrollView } from './RefreshableScrollView';
import { colors, spacing, typography } from '../theme/tokens';

type HeaderProps = {
  title: string;
  onBack: () => void;
};

export function ScreenHeader({ title, onBack }: HeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 22 }} />
    </View>
  );
}

type Props = {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  primaryColor?: string;
};

export function ProfileMenuScreen({
  title,
  onBack,
  children,
  refreshing = false,
  onRefresh,
  primaryColor = colors.primary,
}: Props) {
  return (
    <View style={styles.root}>
      <ScreenHeader title={title} onBack={onBack} />
      {onRefresh ? (
        <RefreshableScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={onRefresh}
          primaryColor={primaryColor}
        >
          {children}
        </RefreshableScrollView>
      ) : (
        <RefreshableScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {children}
        </RefreshableScrollView>
      )}
    </View>
  );
}

export function ComingSoonCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.comingSoon}>
      <Feather name="clock" size={24} color={colors.mutedForeground} />
      <Text style={styles.comingTitle}>{title}</Text>
      <Text style={styles.comingBody}>{description}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.comingSoon}>
      <Feather name={icon} size={28} color={colors.mutedForeground} />
      <Text style={styles.comingTitle}>{title}</Text>
      <Text style={styles.comingBody}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.foreground, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, flexGrow: 1 },
  comingSoon: {
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxxl,
  },
  comingTitle: { ...typography.title, color: colors.foreground, textAlign: 'center' },
  comingBody: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
