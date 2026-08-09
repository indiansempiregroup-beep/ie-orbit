import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, typography } from '../../theme/tokens';

const STATUS_STYLES = {
  confirmed: { bg: colors.successSoft, text: '#047857', label: 'Confirmed' },
  pending: { bg: colors.warningSoft, text: '#B45309', label: 'Pending' },
  cancelled: { bg: colors.destructiveSoft, text: '#B91C1C', label: 'Cancelled' },
  completed: { bg: colors.muted, text: '#475569', label: 'Completed' },
  noshow: { bg: colors.warningSoft, text: '#C2410C', label: 'No Show' },
  paid: { bg: colors.successSoft, text: '#047857', label: 'Paid' },
  unpaid: { bg: colors.destructiveSoft, text: '#B91C1C', label: 'Unpaid' },
} as const;

type Status = keyof typeof STATUS_STYLES;

export function Badge({ status }: { status: Status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  text: { ...typography.tiny, fontFamily: fonts.bodySemi },
});
