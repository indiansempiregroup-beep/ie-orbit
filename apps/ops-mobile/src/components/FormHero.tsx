import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

type Props = {
  /** Kept for call-site compatibility; the stack header already shows the page name. */
  title?: string;
  subtitle?: string;
  icon?: string;
  tone?: string;
};

/** Compact intro copy under the stack header — never repeats the page title. */
export function FormHero({ subtitle }: Props) {
  if (!subtitle) return null;
  return (
    <View style={styles.hero}>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
});
