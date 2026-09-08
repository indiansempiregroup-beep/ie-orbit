import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from './Button';
import { IconBadge } from './IconBadge';
import { colors, iconTones, radius, spacing, typography, type IconTone } from '../../theme/tokens';

type Props = {
  title: string;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: IconTone;
  illustration?: React.ReactNode;
};

export function EmptyState({
  title,
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'blue',
  illustration,
}: Props) {
  return (
    <View style={styles.wrap}>
      {illustration ?? (
        <View style={styles.artwork} importantForAccessibility="no-hide-descendants">
          <View style={[styles.orbitLarge, { backgroundColor: iconTones[tone].background }]} />
          <View style={[styles.orbitSmall, { backgroundColor: iconTones.amber.background }]} />
          <IconBadge icon={icon} tone={tone} size="lg" style={styles.artworkIcon} />
        </View>
      )}
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
  artwork: {
    width: 92,
    height: 76,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitLarge: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: radius.full,
    opacity: 0.72,
  },
  orbitSmall: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: radius.full,
    right: 2,
    top: 2,
  },
  artworkIcon: {
    borderWidth: 3,
    borderColor: colors.card,
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
