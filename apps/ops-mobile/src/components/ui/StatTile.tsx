import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

type Tone = 'default' | 'positive' | 'negative' | 'warning';

type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  onPress?: () => void;
  style?: ViewStyle;
};

/** Visual KPI card. Parent (e.g. TileGrid) owns width — do not use % minWidth here. */
export function StatTile({ label, value, hint, tone = 'default', onPress, style }: Props) {
  const content = (
    <View style={[styles.tile, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          tone === 'positive' && styles.positive,
          tone === 'negative' && styles.negative,
          tone === 'warning' && styles.warning,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      {hint ? (
        <View style={styles.hintRow}>
          {tone === 'negative' ? <Feather name="arrow-down" size={12} color={colors.destructive} /> : null}
          {tone === 'positive' ? <Feather name="arrow-up" size={12} color={colors.success} /> : null}
          {tone === 'warning' ? <Feather name="alert-circle" size={12} color={colors.warning} /> : null}
          <Text style={styles.hint} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.fill, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
  },
  label: { ...typography.caption, color: colors.mutedForeground },
  value: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  positive: { color: colors.success },
  negative: { color: colors.destructive },
  warning: { color: colors.warning },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  hint: { ...typography.tiny, color: colors.mutedForeground, flexShrink: 1 },
  pressed: { opacity: 0.92 },
});
