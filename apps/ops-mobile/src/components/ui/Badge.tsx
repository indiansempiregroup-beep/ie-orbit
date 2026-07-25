import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, typography } from '../../theme/tokens';

const STATUS_STYLES = {
  confirmed: { bg: '#D1FAE5', text: '#047857', label: 'Confirmed' },
  pending: { bg: '#FEF3C7', text: '#B45309', label: 'Pending' },
  cancelled: { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' },
  completed: { bg: '#E2E8F0', text: '#475569', label: 'Completed' },
  noshow: { bg: '#FFEDD5', text: '#C2410C', label: 'No Show' },
} as const;

type Status = keyof typeof STATUS_STYLES;

export function Badge({ status }: { status: Status }) {
  const s = STATUS_STYLES[status];
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
