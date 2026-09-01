import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileBooking } from '@ie-orbit/sdk';
import { Badge, badgeTone, type BadgeStatus } from './ui/Badge';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStartsInLabel,
  bookingTimeRangeLabel,
} from '../utils/bookingDisplay';
import { formatDateTime, mapBookingStatus } from '../utils/format';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const HISTORY_ICONS: Record<BadgeStatus, FeatherName> = {
  confirmed: 'calendar',
  pending: 'clock',
  cancelled: 'x-circle',
  completed: 'check-circle',
  noshow: 'alert-circle',
};

type Props = {
  booking: MobileBooking;
  variant: 'upcoming' | 'recent';
  primaryColor: string;
  onPress: () => void;
};

function dateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { day: '—', month: '' };
  }
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
}

export function HomeBookingRow({ booking, variant, primaryColor, onPress }: Props) {
  const status = mapBookingStatus(booking.status);
  const serviceName = bookingServiceLabel(booking);
  const staffLabel = bookingStaffLabel(booking);
  const timeRange = bookingTimeRangeLabel(booking.start_at, booking.end_at);
  const parts = dateParts(booking.start_at);

  if (variant === 'upcoming') {
    const timing = bookingStartsInLabel(booking.start_at, booking.end_at);
    const timingTone =
      timing.tone === 'now'
        ? { bg: '#DCFCE7', text: '#166534' }
        : timing.tone === 'soon'
          ? { bg: '#EFF6FF', text: '#1D4ED8' }
          : { bg: '#F1F5F9', text: '#475569' };

    return (
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
        <View style={[styles.dateTile, { backgroundColor: `${primaryColor}12` }]}>
          <Text style={[styles.dateMonth, { color: primaryColor }]}>{parts.month}</Text>
          <Text style={[styles.dateDay, { color: primaryColor }]}>{parts.day}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {serviceName}
            </Text>
            <View style={[styles.timingChip, { backgroundColor: timingTone.bg }]}>
              <Text style={[styles.timingText, { color: timingTone.text }]}>{timing.label}</Text>
            </View>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {timeRange}
            {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ''}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {booking.branch?.display_name || 'Salon'}
            {staffLabel ? ` · with ${staffLabel}` : ''}
          </Text>
        </View>
        <Badge status={status} />
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  const tone = badgeTone(status);
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.statusIcon, { backgroundColor: tone.bg }]}>
        <Feather name={HISTORY_ICONS[status]} size={16} color={tone.text} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {serviceName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDateTime(booking.start_at)} · {timeRange}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {booking.branch?.display_name || 'Salon'}
          {staffLabel ? ` · with ${staffLabel}` : ''}
        </Text>
      </View>
      <Badge status={status} />
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.9 },
  dateTile: {
    width: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  dateMonth: { ...typography.tiny, fontWeight: '800', letterSpacing: 0.5 },
  dateDay: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  timingChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  timingText: { ...typography.tiny, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.mutedForeground },
});
