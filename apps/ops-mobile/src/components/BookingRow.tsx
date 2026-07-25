import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from './ui/Badge';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';
import { formatDateTime, formatTime, mapBookingStatus } from '../utils/format';

type Props = {
  serviceName: string;
  customerName?: string;
  staffName?: string;
  startAt?: string | null;
  bookingNumber?: string | null;
  status?: string | null;
  onPress?: () => void;
};

export function BookingRow({
  serviceName,
  customerName,
  staffName,
  startAt,
  bookingNumber,
  status,
  onPress,
}: Props) {
  const timeLabel = startAt ? formatTime(startAt) : '—';
  const dateLabel = startAt ? formatDateTime(startAt) : '';

  const content = (
    <View style={styles.card}>
      <View style={styles.timeBlock}>
        <Text style={styles.time}>{timeLabel}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {serviceName}
        </Text>
        {customerName ? (
          <Text style={styles.meta} numberOfLines={1}>
            {customerName}
          </Text>
        ) : null}
        <Text style={styles.subMeta} numberOfLines={1}>
          {[staffName ? `with ${staffName}` : null, bookingNumber ? `#${bookingNumber}` : null]
            .filter(Boolean)
            .join(' · ') || dateLabel}
        </Text>
      </View>
      <Badge status={mapBookingStatus(status ?? 'pending')} />
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
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  pressed: { opacity: 0.92 },
  timeBlock: {
    minWidth: 58,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  time: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.primary,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.label, fontSize: 15, color: colors.foreground },
  meta: { ...typography.caption, color: colors.foreground },
  subMeta: { ...typography.tiny, color: colors.mutedForeground },
});
