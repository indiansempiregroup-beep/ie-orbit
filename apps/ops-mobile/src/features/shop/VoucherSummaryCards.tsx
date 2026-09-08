import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { formatMoney, type VoucherListSummary } from './shopBooksHelpers';

const EMPTY_SUMMARY: VoucherListSummary = {
  count: 0,
  totalAmount: 0,
  paidAmount: 0,
  unpaidAmount: 0,
  paidCount: 0,
  unpaidCount: 0,
};

type Props = {
  summary?: VoucherListSummary;
  mode?: 'sale' | 'purchase' | 'expense';
  onPressTotal?: () => void;
  onPressPaid?: () => void;
  onPressUnpaid?: () => void;
  metrics?: Array<{ label: string; value: string; hint?: string; tone?: 'paid' | 'due'; onPress?: () => void }>;
};

/** One compact totals row — not three stacked KPI cards. */
export function VoucherSummaryCards({
  summary = EMPTY_SUMMARY,
  mode = 'sale',
  onPressTotal,
  onPressPaid,
  onPressUnpaid,
  metrics,
}: Props) {
  const unpaidLabel = mode === 'purchase' ? 'To pay' : mode === 'expense' ? 'Spent' : 'Due';
  const items =
    metrics ??
    (mode === 'expense'
      ? [
          { label: 'Total', value: formatMoney(summary.totalAmount), hint: `${summary.count}` },
          { label: 'Entries', value: String(summary.count) },
        ]
      : [
          { label: 'Total', value: formatMoney(summary.totalAmount), hint: `${summary.count}`, onPress: onPressTotal },
          {
            label: 'Paid',
            value: formatMoney(summary.paidAmount),
            hint: String(summary.paidCount),
            tone: 'paid' as const,
            onPress: onPressPaid,
          },
          {
            label: unpaidLabel,
            value: formatMoney(summary.unpaidAmount),
            hint: String(summary.unpaidCount),
            tone: 'due' as const,
            onPress: onPressUnpaid,
          },
        ]);

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <Metric {...item} />
        </React.Fragment>
      ))}
    </View>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'paid' | 'due';
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === 'paid' && styles.paid, tone === 'due' && styles.due]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable style={styles.flex} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.flex}>{inner}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  flex: { flex: 1, minWidth: 0 },
  cell: { paddingVertical: 12, paddingHorizontal: 10, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, alignSelf: 'stretch' },
  label: { fontSize: 11, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  value: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.foreground, letterSpacing: -0.2 },
  paid: { color: colors.success },
  due: { color: colors.warning },
  hint: { fontSize: 11, color: colors.mutedForeground },
});
