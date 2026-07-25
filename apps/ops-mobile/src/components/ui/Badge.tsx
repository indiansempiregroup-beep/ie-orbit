import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, typography } from '../../theme/tokens';

const STATUS_STYLES = {
  confirmed: { bg: '#D8F3E7', text: '#0F8A5F', label: 'Confirmed' },
  pending: { bg: '#FCEFCF', text: '#C47A12', label: 'Pending' },
  cancelled: { bg: '#FDE8E8', text: '#C93B3B', label: 'Cancelled' },
  completed: { bg: '#E8E4DC', text: '#5E6B82', label: 'Completed' },
  noshow: { bg: '#FFE8D6', text: '#C2410C', label: 'No Show' },
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
