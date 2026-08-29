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
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function EmptyState({
  title,
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWell}>
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <Button label={actionLabel} onPress={onAction} style={styles.btn} />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="secondary" onPress={onSecondary} style={styles.btn} />
          ) : null}
        </View>
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
  actions: { marginTop: spacing.md, gap: spacing.sm, alignItems: 'center' },
  btn: { minWidth: 160 },
});
