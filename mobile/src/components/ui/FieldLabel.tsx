import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme/tokens';

type Props = {
  label?: string;
  required?: boolean;
  optional?: boolean;
};

export function FieldLabel({ label, required, optional }: Props) {
  if (!label) return null;

  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
        {optional && !required ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  label: { ...typography.label, color: colors.foreground },
  requiredMark: { color: colors.destructive, fontWeight: '700' },
  optional: { ...typography.caption, color: colors.mutedForeground },
});
