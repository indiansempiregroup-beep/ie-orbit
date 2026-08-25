import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileBooking } from '@ie-orbit/sdk';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatTime, mapBookingStatus } from '../utils/format';

type Props = {
  booking: MobileBooking;
  onPress?: () => void;
  primaryColor?: string;
};

const STATUS_COPY: Record<string, { title: string; bg: string; text: string }> = {
  confirmed: { title: 'Confirmed', bg: '#ECFDF5', text: '#047857' },
  pending: { title: 'Pending', bg: '#FFFBEB', text: '#B45309' },
  cancelled: { title: 'Cancelled', bg: '#FEF2F2', text: '#B91C1C' },
  completed: { title: 'Completed', bg: '#F1F5F9', text: '#475569' },
  noshow: { title: 'No show', bg: '#FFEDD5', text: '#C2410C' },
};

export function BookingCard({ booking, onPress, primaryColor = colors.primary }: Props) {
  const mapped = mapBookingStatus(booking.status);
  const tone = STATUS_COPY[mapped] ?? STATUS_COPY.pending;
  const date = new Date(booking.start_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const content = (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <View style={styles.metaCol}>
          <Text style={styles.kicker}>APPOINTMENT</Text>
          <Text style={styles.metaValue}>{dateLabel}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.kicker}>TIME</Text>
          <Text style={styles.metaValue}>{formatTime(booking.start_at)}</Text>
        </View>
        <View style={[styles.metaCol, { flex: 1 }]}>
          <Text style={styles.kicker}>WITH</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {booking.staff_name || booking.branch?.display_name || 'Shop'}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{booking.service_name}</Text>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <View style={[styles.dot, { backgroundColor: tone.text }]} />
        <Text style={[styles.pillText, { color: tone.text }]}>{tone.title}</Text>
      </View>
      <Text style={styles.ref}>#{booking.booking_number}</Text>
      <View style={[styles.action, { borderColor: primaryColor }]}>
        <Text style={[styles.actionText, { color: primaryColor }]}>View details</Text>
        <Feather name="chevron-right" size={16} color={primaryColor} />
      </View>
    </View>
  );

  if (onPress) return <Pressable onPress={onPress}>{content}</Pressable>;
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaCol: { minWidth: 72 },
  kicker: { ...typography.tiny, color: colors.mutedForeground, letterSpacing: 0.4, fontWeight: '700' },
  metaValue: { ...typography.caption, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  title: { ...typography.label, color: colors.foreground, fontWeight: '800', marginTop: spacing.md, fontSize: 16 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...typography.caption, fontWeight: '800' },
  ref: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  action: {
    marginTop: spacing.md,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.background,
  },
  actionText: { ...typography.caption, fontWeight: '700' },
});
