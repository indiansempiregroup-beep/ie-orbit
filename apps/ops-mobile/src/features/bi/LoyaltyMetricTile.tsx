import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HelpModal } from '../../components/ui/HelpModal';
import { colors, fonts, iconTones, radius, type IconTone } from '../../theme/tokens';

type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

type Props = {
  label: string;
  value: React.ReactNode;
  help: string;
  icon: keyof typeof Feather.glyphMap;
  iconTone?: IconTone;
  tone?: Tone;
};

const TONE_BORDER: Record<Tone, string> = {
  positive: '#A7F3D0',
  negative: '#FECDD3',
  warning: '#FDE68A',
  neutral: colors.border,
};

const TONE_BG: Record<Tone, string> = {
  positive: iconTones.green.background,
  negative: iconTones.rose.background,
  warning: iconTones.amber.background,
  neutral: colors.card,
};

/** Compact inline chip: icon + value + help. */
export function LoyaltyMetricTile({
  label,
  value,
  help,
  icon,
  iconTone = 'blue',
  tone = 'neutral',
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const palette = iconTones[iconTone];

  return (
    <View style={[styles.chip, { backgroundColor: TONE_BG[tone], borderColor: TONE_BORDER[tone] }]}>
      <View style={[styles.iconWrap, { backgroundColor: palette.background }]}>
        <Feather name={icon} size={11} color={palette.foreground} />
      </View>
      <View style={styles.valueWrap}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text style={styles.valueText} numberOfLines={1}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
      <Pressable
        onPress={() => setHelpOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`About ${label}`}
        style={[styles.helpBtn, helpOpen && styles.helpBtnActive]}
      >
        <Text style={[styles.helpBtnText, helpOpen && styles.helpBtnTextActive]}>?</Text>
      </Pressable>
      <HelpModal visible={helpOpen} title={label} body={help} onClose={() => setHelpOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 5,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: '100%',
  },
  iconWrap: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  valueText: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.foreground,
  },
  helpBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
    fontSize: 9,
    color: colors.mutedForeground,
    lineHeight: 11,
  },
  helpBtnTextActive: {
    color: colors.primaryForeground,
  },
});
