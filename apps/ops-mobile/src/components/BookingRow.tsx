import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Badge } from './ui/Badge';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';
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
  /** Formatted total, e.g. from line price snapshots. */
  priceLabel?: string | null;
  highlight?: boolean;
  compact?: boolean;
  attached?: boolean;
  onPress?: () => void;
  /** Opens HTML tax invoice (Sale-list View). */
  onViewInvoice?: () => void;
  /** Opens DocumentActionsSheet (Sale-list Share). */
  onShareInvoice?: () => void;
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
  priceLabel,
  highlight = false,
  compact = false,
  attached = false,
  onPress,
  onViewInvoice,
  onShareInvoice,
}: Props) {
  const statusKey = String(status || '').toLowerCase();
  const isTerminal = ['completed', 'cancelled', 'rejected', 'no_show', 'expired'].includes(statusKey);
  const timing = bookingStartsInLabel(startAt, endAt);
  const timingTone = isTerminal ? 'done' : timing.tone;
  const timingColors = TIMING_COLORS[timingTone];
  const timingLabel = isTerminal || timingTone === 'done' ? '' : timing.label;
  const timeRange = bookingTimeRangeLabel(startAt, endAt);
  const startLabel = startAt ? formatTime(startAt) : '—';
  const dateLabel = startAt ? formatDate(startAt) : '';
  const servicesLabel =
    serviceCount && serviceCount > 1 ? `${serviceCount} services` : durationMinutes ? `${durationMinutes} min` : '';
  const phone = String(customerPhone || '').trim();
  const showActionRail = Boolean(phone || onViewInvoice || onShareInvoice);
  const amount = String(priceLabel || '').trim();

  const content = (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        attached && styles.cardAttached,
        highlight && styles.cardHighlight,
      ]}
    >
      <View style={[styles.timeBlock, compact && styles.timeBlockCompact, { backgroundColor: timingColors.bg }]}>
        <Text style={[styles.time, { color: timingColors.text }]}>{startLabel}</Text>
        {timingLabel ? (
          <Text style={[styles.relative, { color: timingColors.text }]} numberOfLines={1}>
            {timingLabel}
          </Text>
        ) : null}
        {dateLabel ? (
          <Text style={[styles.dateUnder, { color: timingColors.text }]} numberOfLines={2}>
            {dateLabel}
          </Text>
        ) : null}
      </View>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {serviceName}
          </Text>
          {amount ? <Text style={styles.amount}>{amount}</Text> : null}
        </View>

        <View style={styles.badgeRow}>
          <Badge status={mapBookingStatus(status ?? 'pending')} />
        </View>

        {customerName ? (
          <View style={styles.metaRow}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={styles.meta} numberOfLines={1}>
              {customerName}
              {phone ? ` · ${phone}` : ''}
            </Text>
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
          </Text>
        ) : null}
      </View>

      {showActionRail ? (
        <View style={styles.iconRail}>
          {phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call customer"
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation?.();
                void Linking.openURL(`tel:${phone}`);
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Feather name="phone" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          {onViewInvoice ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View invoice"
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation?.();
                onViewInvoice();
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Feather name="eye" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          {onShareInvoice ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share invoice"
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation?.();
                onShareInvoice();
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Feather name="share-2" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.pressable, pressed && styles.pressed]} onPress={onPress}>
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
    ...shadows.soft,
  },
  cardCompact: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cardAttached: {
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  cardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
    shadowOpacity: 0.12,
  },
  pressable: { width: '100%', maxWidth: '100%' },
  pressed: { opacity: 0.92 },
  timeBlock: {
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  timeBlockCompact: {
    minWidth: 64,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
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
  dateUnder: {
    ...typography.tiny,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
  },
  body: { flex: 1, gap: 6, minWidth: 0 },
  bodyCompact: { gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.label, color: colors.foreground, flex: 1 },
  amount: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.foreground,
    flexShrink: 0,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typography.caption, color: colors.foreground, flex: 1 },
  subMeta: { ...typography.tiny, color: colors.mutedForeground, flex: 1, lineHeight: 16 },
  ref: { ...typography.tiny, color: colors.mutedForeground },
  iconRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    alignSelf: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnPressed: { opacity: 0.75 },
});
