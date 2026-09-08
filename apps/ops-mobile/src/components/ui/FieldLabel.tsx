import React from 'react';
import { Text, View } from 'react-native';
import { fieldStyles } from './fieldStyles';

type Props = {
  label?: string;
  required?: boolean;
  optional?: boolean;
};

export function FieldLabel({ label, required, optional }: Props) {
  if (!label) return null;

  return (
    <View style={fieldStyles.labelRow}>
      <Text style={fieldStyles.label}>
        {label}
        {required ? <Text style={fieldStyles.requiredMark}> *</Text> : null}
        {optional && !required ? <Text style={fieldStyles.optional}> (optional)</Text> : null}
      </Text>
    </View>
  );
}
