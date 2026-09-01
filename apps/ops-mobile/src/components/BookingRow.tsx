import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Badge } from './ui/Badge';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { bookingStartsInLabel, bookingTimeRangeLabel } from '../utils/bookingDisplay';
import { formatDate, formatTime, mapBookingStatus } from '../utils/format';

type Props = {
  serviceName: string;
  customerName?: string;
  customerPhone?: string;
  staffName?: string;
  startAt?: string | null;
  endAt?: string | null;
  durationMinutes?: number | null;
  serviceCount?: number;
  bookingNumber?: string | null;
  status?: string | null;
  highlight?: boolean;
  onPress?: () => void;
};

const TIMING_COLORS = {
  now: { bg: '#DCFCE7', text: '#166534' },
  soon: { bg: colors.tint, text: colors.primary },
  later: { bg: colors.secondary, text: colors.primary },
  done: { bg: colors.muted, text: colors.mutedForeground },
} as const;

export function BookingRow({
  serviceName,
  customerName,
  customerPhone,
  staffName,
  startAt,
  endAt,
  durationMinutes,
  serviceCount,
  bookingNumber,
  status,
  highlight = false,
  onPress,
}: Props) {
  const timing = bookingStartsInLabel(startAt, endAt);
  const timingColors = TIMING_COLORS[timing.tone];
  const timeRange = bookingTimeRangeLabel(startAt, endAt);
  const startLabel = startAt ? formatTime(startAt) : '—';
  const dateLabel = startAt ? formatDate(startAt) : '';
  const servicesLabel =
    serviceCount && serviceCount > 1 ? `${serviceCount} services` : durationMinutes ? `${durationMinutes} min` : '';

  const content = (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
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
          <Badge status={mapBookingStatus(status ?? 'pending')} />
        </View>

        {customerName ? (
          <View style={styles.metaRow}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={styles.meta} numberOfLines={1}>
              {customerName}
              {customerPhone ? ` · ${customerPhone}` : ''}
            </Text>
            {customerPhone ? (
              <Pressable
                style={styles.inlineCall}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation?.();
                  void Linking.openURL(`tel:${customerPhone}`);
                }}
              >
                <Feather name="phone" size={13} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Feather name="clock" size={12} color={colors.mutedForeground} />
          <Text style={styles.subMeta} numberOfLines={1}>
            {[timeRange, servicesLabel, staffName ? `Staff: ${staffName}` : 'Staff: Unassigned']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        {bookingNumber ? (
          <Text style={styles.ref} numberOfLines={1}>
            #{bookingNumber}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [pressed && styles.pressed]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  pressed: { opacity: 0.92 },
  timeBlock: {
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  time: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  relative: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  body: { flex: 1, gap: 6, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.label, color: colors.foreground, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typography.caption, color: colors.foreground, flex: 1 },
  subMeta: { ...typography.tiny, color: colors.mutedForeground, flex: 1, lineHeight: 16 },
  ref: { ...typography.tiny, color: colors.mutedForeground },
  inlineCall: { padding: 2 },
});
