import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileBooking } from '@ie-orbit/sdk';
import {
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStartsInLabel,
  bookingTimeRangeLabel,
} from '../utils/bookingDisplay';
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

const TIMING_COLORS = {
  now: { bg: '#DCFCE7', text: '#166534' },
  soon: { bg: '#EFF6FF', text: '#1D4ED8' },
  later: { bg: '#F1F5F9', text: '#475569' },
  done: { bg: '#F1F5F9', text: '#64748B' },
} as const;

export function BookingCard({ booking, onPress, primaryColor = colors.primary }: Props) {
  const mapped = mapBookingStatus(booking.status);
  const tone = STATUS_COPY[mapped] ?? STATUS_COPY.pending;
  const timing = bookingStartsInLabel(booking.start_at, booking.end_at);
  const timingColors = TIMING_COLORS[timing.tone];
  const serviceName = bookingServiceLabel(booking);
  const staffLabel = bookingStaffLabel(booking);
  const timeRange = bookingTimeRangeLabel(booking.start_at, booking.end_at);
  const date = new Date(booking.start_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const serviceCount = booking.items?.length ?? 0;
  const locationLabel = booking.branch?.display_name || 'Salon';

  const content = (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.timingChip, { backgroundColor: timingColors.bg }]}>
          <Feather
            name={timing.tone === 'now' ? 'activity' : 'clock'}
            size={12}
            color={timingColors.text}
          />
          <Text style={[styles.timingText, { color: timingColors.text }]}>{timing.label}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <View style={[styles.dot, { backgroundColor: tone.text }]} />
          <Text style={[styles.pillText, { color: tone.text }]}>{tone.title}</Text>
        </View>
      </View>

      <Text style={styles.title}>{serviceName}</Text>

      <View style={styles.metaRow}>
        <Feather name="calendar" size={12} color={colors.mutedForeground} />
        <Text style={styles.metaText}>
          {dateLabel} · {timeRange}
          {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ''}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Feather name="map-pin" size={12} color={colors.mutedForeground} />
        <Text style={styles.metaText} numberOfLines={1}>
          {locationLabel}
        </Text>
      </View>

      {staffLabel ? (
        <View style={styles.metaRow}>
          <Feather name="user-check" size={12} color={colors.mutedForeground} />
          <Text style={styles.metaText} numberOfLines={2}>
            with {staffLabel}
          </Text>
        </View>
      ) : null}

      {serviceCount > 1 ? (
        <View style={styles.metaRow}>
          <Feather name="layers" size={12} color={colors.mutedForeground} />
          <Text style={styles.metaText}>{serviceCount} services</Text>
        </View>
      ) : null}

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
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  timingText: { ...typography.tiny, fontWeight: '700' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...typography.caption, fontWeight: '800' },
  title: { ...typography.label, color: colors.foreground, fontWeight: '800', fontSize: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  ref: { ...typography.caption, color: colors.mutedForeground },
  action: {
    marginTop: spacing.xs,
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
