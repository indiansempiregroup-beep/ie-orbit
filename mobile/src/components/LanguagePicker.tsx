import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_LANGUAGES, type AppLanguageCode } from '@ie-platform/i18n';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  onChange: (value: AppLanguageCode) => void;
  primaryColor?: string;
};

export function LanguagePicker({ label, value, onChange, primaryColor = colors.primary }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {APP_LANGUAGES.map((option) => {
          const selected = value === option.code;
          return (
            <Pressable
              key={option.code}
              onPress={() => onChange(option.code)}
              style={[
                styles.chip,
                selected && { backgroundColor: primaryColor, borderColor: primaryColor },
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.nativeLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  chipText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
});
