import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
  message: string;
  tone?: 'error' | 'success';
};

export function FormAlert({ message, tone = 'error' }: Props) {
  const isError = tone === 'error';

  return (
    <View
      accessibilityRole="alert"
      style={[styles.wrap, isError ? styles.errorWrap : styles.successWrap]}
    >
      <Feather
        name={isError ? 'alert-circle' : 'check-circle'}
        size={18}
        color={isError ? '#B45309' : colors.success}
        style={styles.icon}
      />
      <Text style={[styles.text, isError ? styles.errorText : styles.successText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorWrap: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  successWrap: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  icon: { marginTop: 1 },
  text: { ...typography.body, flex: 1, lineHeight: 20 },
  errorText: { color: '#9A3412' },
  successText: { color: '#065F46' },
});
