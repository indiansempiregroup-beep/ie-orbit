import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ShopOrder } from '@ie-orbit/sdk';
import { shopOrderBadgeStyle } from '../features/shop/posPayment';
import {
  orderCustomerLabel,
  orderCustomerPhone,
  orderDeliveryNote,
  orderMetaSummary,
  orderNextActionLabel,
  orderCreatedDateLabel,
  orderRefLabel,
  orderRelativeTimeLabel,
  orderTitle,
  orderTotalLabel,
} from '../utils/shopOrderDisplay';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

type Props = {
  order: ShopOrder;
  customerMap?: Map<string, string>;
  highlight?: boolean;
  compact?: boolean;
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
  onPress,
}: Props) {
  const timingColors = TIMING_COLORS[timingTone(order.created_at)];
  const badge = shopOrderBadgeStyle(order);
  const customerName = orderCustomerLabel(order, customerMap);
  const customerPhone = orderCustomerPhone(order);
  const deliveryNote = orderDeliveryNote(order);
  const nextAction = orderNextActionLabel(order);
  const createdDate = orderCreatedDateLabel(order.created_at);

  const content = (
    <View style={[styles.card, compact && styles.cardCompact, highlight && styles.cardHighlight]}>
      <View style={[styles.timeBlock, compact && styles.timeBlockCompact, { backgroundColor: timingColors.bg }]}>
        <Text style={[styles.amount, { color: timingColors.text }]} numberOfLines={1}>
          {orderTotalLabel(order)}
        </Text>
        <Text style={[styles.relative, { color: timingColors.text }]} numberOfLines={2}>
          {orderRelativeTimeLabel(order.created_at)}
        </Text>
        {createdDate ? (
          <Text style={[styles.date, { color: timingColors.text }]} numberOfLines={2}>
            {createdDate}
          </Text>
        ) : null}
      </View>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {orderTitle(order)}
          </Text>
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

        <View style={styles.metaRow}>
          <Feather name={fulfillmentIcon(order)} size={12} color={colors.mutedForeground} />
          <Text style={styles.subMeta} numberOfLines={1}>
            {orderMetaSummary(order)}
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

        {nextAction ? (
          <Text style={styles.actionHint} numberOfLines={1}>
            Next: {nextAction}
          </Text>
        ) : null}

        <Text style={styles.ref}>{orderRefLabel(order)}</Text>
      </View>
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
  },
  cardCompact: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
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
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  timeBlockCompact: {
    minWidth: 64,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  amount: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textAlign: 'center',
  },
  relative: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
    lineHeight: 14,
  },
  date: {
    ...typography.tiny,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 1,
  },
  body: { flex: 1, gap: 5, minWidth: 0 },
  bodyCompact: { gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.label,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    flex: 1,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    maxWidth: '42%',
  },
  statusBadgeText: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typography.caption, color: colors.foreground, flex: 1 },
  subMeta: { ...typography.tiny, color: colors.mutedForeground, flex: 1, lineHeight: 15 },
  actionHint: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  ref: { ...typography.tiny, color: colors.mutedForeground },
  inlineCall: { padding: 2 },
});
