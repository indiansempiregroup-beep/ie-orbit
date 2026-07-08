import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function ScreenState({
  loading,
  error,
  empty,
  emptyMessage = 'Nothing here yet.',
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{emptyMessage}</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  error: { ...typography.body, color: colors.destructive, textAlign: 'center' },
  empty: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
