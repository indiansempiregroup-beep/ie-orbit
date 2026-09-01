import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Booking } from '@ie-orbit/sdk';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import {
  bookingCustomerLabel,
  bookingCustomerPhone,
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStartsInLabel,
  bookingTimeRangeLabel,
} from '../utils/bookingDisplay';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { mapBookingStatus } from '../utils/format';

type Props = {
  booking: Booking;
  serviceMap: Map<string, string>;
  customerMap: Map<string, string>;
  staffMap: Map<string, string>;
  onOpen: () => void;
};

const TONE_STYLES = {
  now: { bg: '#DCFCE7', border: '#86EFAC', accent: '#15803D', chip: '#166534' },
  soon: { bg: colors.tint, border: colors.border, accent: colors.primary, chip: colors.primary },
  later: { bg: colors.card, border: colors.border, accent: colors.primary, chip: colors.mutedForeground },
  done: { bg: colors.muted, border: colors.border, accent: colors.mutedForeground, chip: colors.mutedForeground },
} as const;

export function UpcomingBookingHero({
  booking,
  serviceMap,
  customerMap,
  staffMap,
  onOpen,
}: Props) {
  const serviceName = bookingServiceLabel(booking, serviceMap);
  const customerName = bookingCustomerLabel(booking, customerMap);
  const customerPhone = bookingCustomerPhone(booking);
  const staffName = bookingStaffLabel(booking, staffMap) || 'Unassigned';
  const timing = bookingStartsInLabel(booking.start_at, booking.end_at);
  const tone = TONE_STYLES[timing.tone];
  const timeRange = bookingTimeRangeLabel(booking.start_at, booking.end_at);
  const serviceCount = booking.line_items?.length ?? 0;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
      onPress={onOpen}
    >
      <Text style={styles.eyebrow}>Next up today</Text>
      <View style={styles.topRow}>
        <View style={[styles.timingChip, { backgroundColor: `${tone.accent}18` }]}>
          <Feather
            name={timing.tone === 'now' ? 'activity' : 'clock'}
            size={14}
            color={tone.chip}
          />
          <Text style={[styles.timingText, { color: tone.chip }]}>{timing.label}</Text>
        </View>
        <Badge status={mapBookingStatus(booking.status ?? 'pending')} />
      </View>

      <Text style={styles.service} numberOfLines={2}>
        {serviceName}
      </Text>

      <View style={styles.customerRow}>
        <Feather name="user" size={15} color={colors.mutedForeground} />
        <Text style={styles.customerName} numberOfLines={1}>
          {customerName}
        </Text>
        {customerPhone ? (
          <Pressable
            style={styles.callBtn}
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation?.();
              void Linking.openURL(`tel:${customerPhone}`);
            }}
          >
            <Feather name="phone" size={14} color={colors.primary} />
            <Text style={styles.callText}>Call</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Feather name="clock" size={13} color={colors.mutedForeground} />
          <Text style={styles.metaText}>{timeRange}</Text>
        </View>
        {booking.duration_minutes ? (
          <View style={styles.metaItem}>
            <Feather name="watch" size={13} color={colors.mutedForeground} />
            <Text style={styles.metaText}>{booking.duration_minutes} min</Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <Feather name="user-check" size={13} color={colors.mutedForeground} />
          <Text style={styles.metaText} numberOfLines={1}>
            {staffName}
          </Text>
        </View>
        {serviceCount > 1 ? (
          <View style={styles.metaItem}>
            <Feather name="layers" size={13} color={colors.mutedForeground} />
            <Text style={styles.metaText}>{serviceCount} services</Text>
          </View>
        ) : null}
      </View>

      {booking.booking_number ? (
        <Text style={styles.ref}>#{booking.booking_number}</Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Open booking" size="sm" variant="soft" onPress={onOpen} />
        {customerPhone ? (
          <Button
            label="Call customer"
            size="sm"
            variant="outline"
            icon="phone"
            onPress={() => void Linking.openURL(`tel:${customerPhone}`)}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  timingText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  service: { ...typography.title, color: colors.foreground, marginTop: 2 },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  customerName: {
    ...typography.body,
    color: colors.foreground,
    fontFamily: fonts.bodyMedium,
    flex: 1,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  callText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%' },
  metaText: { ...typography.caption, color: colors.mutedForeground },
  ref: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
