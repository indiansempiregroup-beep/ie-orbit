import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, icon = 'inbox', actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWell}>
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.foreground, textAlign: 'center' },
  message: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    maxWidth: 280,
  },
  btn: { marginTop: spacing.md, minWidth: 160 },
});
