import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileBooking } from '@ie-orbit/sdk';
import { Badge } from './ui/Badge';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStartsInLabel,
  bookingTimeRangeLabel,
} from '../utils/bookingDisplay';
import { formatDate, formatTime, mapBookingStatus } from '../utils/format';

type Props = {
  booking: MobileBooking;
  variant: 'upcoming' | 'recent';
  primaryColor: string;
  attached?: boolean;
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

export function HomeBookingRow({ booking, variant, primaryColor, attached = false, onPress }: Props) {
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
      <Pressable
        style={({ pressed }) => [
          styles.upcomingCard,
          attached && styles.cardAttached,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
      >
        <View style={[styles.dateTile, { backgroundColor: `${primaryColor}12` }]}>
          <Text style={[styles.dateMonth, { color: primaryColor }]}>{parts.month}</Text>
          <Text style={[styles.dateDay, { color: primaryColor }]}>{parts.day}</Text>
        </View>
        <View style={styles.upcomingBody}>
          <View style={styles.upcomingTitleRow}>
            <Text style={styles.upcomingTitle} numberOfLines={1}>
              {serviceName}
            </Text>
            <View style={[styles.timingChip, { backgroundColor: timingTone.bg }]}>
              <Text style={[styles.timingText, { color: timingTone.text }]}>{timing.label}</Text>
            </View>
          </View>
          <Text style={styles.upcomingMeta} numberOfLines={1}>
            {timeRange}
            {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ''}
          </Text>
          <Text style={styles.upcomingMeta} numberOfLines={1}>
            {booking.branch?.display_name || 'Salon'}
            {staffLabel ? ` · with ${staffLabel}` : ''}
          </Text>
        </View>
        <Badge status={status} />
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  const timing = bookingStartsInLabel(booking.start_at, booking.end_at);
  const timingColors =
    timing.tone === 'now'
      ? { bg: '#DCFCE7', text: '#166534' }
      : timing.tone === 'soon'
        ? { bg: `${primaryColor}18`, text: primaryColor }
        : timing.tone === 'later'
          ? { bg: `${primaryColor}12`, text: primaryColor }
          : { bg: colors.muted, text: colors.mutedForeground };
  const startLabel = booking.start_at ? formatTime(booking.start_at) : '—';
  const dateLabel = booking.start_at ? formatDate(booking.start_at) : '';
  const serviceCount = booking.items?.length ?? 0;
  const servicesLabel =
    serviceCount > 1 ? `${serviceCount} services` : booking.duration_minutes ? `${booking.duration_minutes} min` : '';
  const locationLabel = booking.branch?.display_name || 'Salon';

  return (
    <Pressable style={({ pressed }) => [styles.pressable, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.card, attached && styles.cardAttached]}>
        <View style={[styles.timeBlock, { backgroundColor: timingColors.bg }]}>
          <Text style={[styles.time, { color: timingColors.text }]}>{startLabel}</Text>
          <Text style={[styles.relative, { color: timingColors.text }]} numberOfLines={1}>
            {timing.label}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {serviceName}
            </Text>
            <Badge status={status} />
          </View>

          <View style={styles.metaRow}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={styles.meta} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={styles.subMeta} numberOfLines={1}>
              {[timeRange, servicesLabel, staffLabel ? `with ${staffLabel}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>

          {booking.booking_number ? (
            <Text style={styles.ref} numberOfLines={1}>
              #{booking.booking_number}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%', maxWidth: '100%' },
  pressed: { opacity: 0.92 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: '#0e2f3a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardAttached: {
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  timeBlock: {
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  time: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 14,
  },
  relative: {
    ...typography.tiny,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: { flex: 1, gap: 6, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.label, color: colors.foreground, fontWeight: '600', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typography.caption, color: colors.foreground, flex: 1 },
  subMeta: { ...typography.tiny, color: colors.mutedForeground, flex: 1, lineHeight: 16 },
  ref: { ...typography.tiny, color: colors.mutedForeground },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateTile: {
    width: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  dateMonth: { ...typography.tiny, fontWeight: '800', letterSpacing: 0.5 },
  dateDay: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  upcomingBody: { flex: 1, minWidth: 0, gap: 2 },
  upcomingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  upcomingTitle: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  timingChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  timingText: { ...typography.tiny, fontWeight: '700' },
  upcomingMeta: { ...typography.caption, color: colors.mutedForeground },
});
