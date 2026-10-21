import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';
import { withAlpha } from '../theme/colorUtils';
import { formatMoney } from '../features/shop/posPayment';

export type RewardPointsBannerProps = {
  earned?: number;
  pending?: number;
  redeemed?: number;
  reversed?: number;
  remaining?: number;
  discountAmount?: number;
  reversalReason?: string;
  currency?: string | null;
};

function chip(label: string, background: string, color: string) {
  return (
    <View key={label} style={[styles.chip, { backgroundColor: background }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export function RewardPointsBanner({
  earned = 0,
  pending = 0,
  redeemed = 0,
  reversed = 0,
  remaining,
  discountAmount = 0,
  reversalReason = '',
  currency,
}: RewardPointsBannerProps) {
  const kept = remaining != null ? remaining : Math.max(0, earned - reversed);
  const hasContent = earned > 0 || pending > 0 || redeemed > 0 || reversed > 0;
  if (!hasContent) return null;

  const fullyReversed = reversed > 0 && kept <= 0;
  const accent = fullyReversed ? colors.destructive : earned > 0 ? colors.success : pending > 0 ? colors.warning : colors.primary;
  const surface = fullyReversed
    ? colors.destructiveSoft
    : earned > 0
      ? colors.successSoft
      : pending > 0
        ? colors.warningSoft
        : withAlpha(colors.primary, 0.08);
  const hero = fullyReversed ? reversed : earned > 0 ? earned : pending > 0 ? pending : redeemed;
  const heroPrefix = fullyReversed || (earned <= 0 && pending <= 0 && redeemed > 0) ? '−' : '+';
  const title = fullyReversed
    ? 'Points reversed'
    : earned > 0
      ? 'Points given'
      : pending > 0
        ? 'Will earn'
        : 'Points used';
  const subtitle = fullyReversed
    ? reversalReason || 'These points were taken back after cancel or refund.'
    : earned > 0
      ? reversed > 0
        ? `${kept} still kept · ${reversalReason || 'some points were reversed'}`
        : 'Credited when this appointment was completed.'
      : pending > 0
        ? 'These points credit when the appointment is completed.'
        : discountAmount > 0
          ? `Customer saved ${formatMoney(discountAmount, currency)} on this bill.`
          : 'Redeemed on this booking.';

  return (
    <View style={[styles.banner, { backgroundColor: surface, borderColor: withAlpha(accent, 0.22) }]}>
      <View style={styles.heroRow}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16) }]}>
          <Feather name={fullyReversed ? 'rotate-ccw' : 'award'} size={22} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: accent }]}>{title}</Text>
          <Text style={styles.hero}>
            {heroPrefix}
            {hero}
            <Text style={styles.heroUnit}> pts</Text>
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      {earned > 0 || redeemed > 0 || reversed > 0 || discountAmount > 0 ? (
        <View style={styles.chips}>
          {earned > 0 ? chip(`Given +${earned}`, withAlpha(colors.success, 0.14), colors.success) : null}
          {pending > 0 && earned <= 0
            ? chip(`Will earn +${pending}`, withAlpha(colors.warning, 0.16), colors.warning)
            : null}
          {redeemed > 0 ? chip(`Used −${redeemed}`, withAlpha(colors.warning, 0.16), colors.warning) : null}
          {discountAmount > 0
            ? chip(`Saved ${formatMoney(discountAmount, currency)}`, '#ECFDF5', '#047857')
            : null}
          {reversed > 0 ? chip(`Reversed −${reversed}`, colors.destructiveSoft, colors.destructive) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: {
    ...typography.tiny,
    fontFamily: fonts.bodyBold,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hero: {
    ...typography.kpiValue,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  heroUnit: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
  subtitle: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipText: { ...typography.caption, fontFamily: fonts.bodySemi, fontWeight: '700' },
});
