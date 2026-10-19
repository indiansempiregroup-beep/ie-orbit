import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HelpModal } from './HelpModal';
import { IconBadge } from './IconBadge';
import { colors, fonts, radius, shadows, spacing, typography, type IconTone } from '../../theme/tokens';

type Tone = 'default' | 'positive' | 'negative' | 'warning';

type Props = {
  label: string;
  value: string;
  hint?: string;
  /** Plain-language explanation shown when user taps the ? icon */
  help?: string;
  tone?: Tone;
  onPress?: () => void;
  style?: ViewStyle;
  icon?: keyof typeof Feather.glyphMap;
  iconTone?: IconTone;
};

/** Visual KPI card. Parent (e.g. TileGrid) owns width — do not use % minWidth here. */
export function StatTile({
  label,
  value,
  hint,
  help,
  tone = 'default',
  onPress,
  style,
  icon,
  iconTone = 'blue',
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  const content = (
    <View style={[styles.tile, helpOpen && styles.tileHelpOpen, style]}>
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {help ? (
            <Pressable
              onPress={() => setHelpOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`About ${label}`}
              style={[styles.helpBtn, helpOpen && styles.helpBtnActive]}
            >
              <Text style={[styles.helpBtnText, helpOpen && styles.helpBtnTextActive]}>?</Text>
            </Pressable>
          ) : null}
        </View>
        {icon ? <IconBadge icon={icon} tone={iconTone} size="sm" /> : null}
      </View>
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
          <Text style={styles.hint} numberOfLines={2}>
            {hint}
          </Text>
        </View>
      ) : null}

      {help ? (
        <HelpModal
          visible={helpOpen}
          title={label}
          body={help}
          onClose={() => setHelpOpen(false)}
        />
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
    ...shadows.soft,
  },
  tileHelpOpen: {
    borderColor: colors.primary,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  labelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  label: { ...typography.caption, color: colors.mutedForeground, flexShrink: 1 },
  helpBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  helpBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 14,
  },
  helpBtnTextActive: {
    color: colors.primaryForeground,
  },
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
