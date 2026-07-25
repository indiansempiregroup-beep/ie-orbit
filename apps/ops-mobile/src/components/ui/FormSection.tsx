import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';

type Props = {
  step?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function FormSection({ step, title, subtitle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {step != null ? (
          <View style={styles.step}>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ) : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  step: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accentForeground },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground },
  subtitle: { ...typography.caption, color: colors.mutedForeground },
  body: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
});
