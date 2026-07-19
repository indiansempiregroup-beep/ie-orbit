import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { marginTop: spacing.md, gap: 4 },
  label: { ...typography.caption, color: colors.mutedForeground },
  value: { ...typography.body, color: colors.foreground },
});
