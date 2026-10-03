import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ShopOrder } from '@ie-orbit/sdk';
import { shopOrderBadgeStyle } from '../features/shop/posPayment';
import {
  orderCallPhone,
  orderCustomerLabel,
  orderDeliveryNote,
  orderMetaSummary,
  orderNextActionLabel,
  orderCreatedDateLabel,
  orderRefLabel,
  orderRelativeTimeLabel,
  orderTimeLabel,
  orderTitle,
  orderTotalLabel,
} from '../utils/shopOrderDisplay';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';

type Props = {
  order: ShopOrder;
  customerMap?: Map<string, string>;
  highlight?: boolean;
  compact?: boolean;
  attached?: boolean;
  onPress?: () => void;
};

const TIMING_COLORS = {
  fresh: { bg: '#DCFCE7', text: '#166534' },
  recent: { bg: colors.tint, text: colors.primary },
  older: { bg: colors.secondary, text: colors.primary },
} as const;

function timingTone(createdAt?: string | null): keyof typeof TIMING_COLORS {
  if (!createdAt) return 'older';
  const diffMinutes = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diffMinutes < 15) return 'fresh';
  if (diffMinutes < 120) return 'recent';
  return 'older';
}

function fulfillmentIcon(order: ShopOrder): keyof typeof Feather.glyphMap {
  const mode = String(order.fulfillment_mode || '').toLowerCase();
  return mode === 'delivery' ? 'truck' : 'shopping-bag';
}

export function OrderRow({
  order,
  customerMap,
  highlight = false,
  compact = false,
  attached = false,
  onPress,
}: Props) {
  const timingColors = TIMING_COLORS[timingTone(order.created_at)];
  const badge = shopOrderBadgeStyle(order);
  const customerName = orderCustomerLabel(order, customerMap);
  const callPhone = orderCallPhone(order);
  const deliveryNote = orderDeliveryNote(order);
  const nextAction = orderNextActionLabel(order);
  const createdDate = orderCreatedDateLabel(order.created_at);
  const placed = orderTimeLabel(order.created_at);
  const relative = orderRelativeTimeLabel(order.created_at);
  const showRelative = Boolean(relative && relative !== '—' && relative !== placed.time);
  const amount = orderTotalLabel(order);
  const showActionRail = Boolean(callPhone);

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
        <Text style={[styles.time, { color: timingColors.text }]}>{placed.time}</Text>
        {showRelative ? (
          <Text style={[styles.relative, { color: timingColors.text }]} numberOfLines={1}>
            {relative}
          </Text>
        ) : null}
        {createdDate ? (
          <Text style={[styles.dateUnder, { color: timingColors.text }]} numberOfLines={2}>
            {createdDate}
          </Text>
        ) : null}
      </View>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {orderTitle(order)}
          </Text>
          {amount ? <Text style={styles.amount}>{amount}</Text> : null}
        </View>

        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]} numberOfLines={1}>
              {badge.label}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Feather name="user" size={12} color={colors.mutedForeground} />
          <Text style={styles.meta} numberOfLines={1}>
            {customerName}
            {callPhone ? ` · ${callPhone}` : ''}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Feather name={fulfillmentIcon(order)} size={12} color={colors.mutedForeground} />
          <Text style={styles.subMeta} numberOfLines={1}>
            {[orderMetaSummary(order), nextAction ? `Next: ${nextAction}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {deliveryNote ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={styles.subMeta} numberOfLines={1}>
              {deliveryNote}
            </Text>
          </View>
        ) : null}

        <Text style={styles.ref} numberOfLines={1}>
          {orderRefLabel(order)}
        </Text>
      </View>

      {showActionRail ? (
        <View style={styles.iconRail}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call customer"
            hitSlop={6}
            onPress={(event) => {
              event.stopPropagation?.();
              void Linking.openURL(`tel:${callPhone}`);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Feather name="phone" size={16} color={colors.primary} />
          </Pressable>
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
  },
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
