import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from './ui/Button';
import { colors, fonts, spacing, typography } from '../theme/tokens';

export function ScreenState({
  loading,
  error,
  empty,
  emptyMessage = 'Nothing here yet.',
  emptyTitle = 'Nothing here',
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Feather name="alert-circle" size={22} color={colors.destructive} />
        </View>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.error}>{error}</Text>
        {actionLabel && onAction ? (
          <View style={styles.action}>
            <Button label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <View style={[styles.iconWrap, styles.iconMuted]}>
          <Feather name="inbox" size={22} color={colors.mutedForeground} />
        </View>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.empty}>{emptyMessage}</Text>
        {actionLabel && onAction ? (
          <View style={styles.action}>
            <Button label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FDE8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconMuted: { backgroundColor: colors.muted },
  loadingText: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  errorTitle: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground },
  error: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground },
  empty: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  action: { marginTop: spacing.md },
});
