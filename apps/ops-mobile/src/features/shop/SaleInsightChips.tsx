import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../theme/tokens';
import { LoyaltyMetricTile } from '../bi/LoyaltyMetricTile';
import { formatMoney } from './posPayment';

export const SALE_INSIGHT_HELP = {
  points:
    'Reward points on this sale or booking. Green (+) means you gave points; amber (−) means the customer used points to pay less; rose means points were reversed after a cancel, return, or refund.',
  profit:
    'What you kept from this shop sale after stock cost and discounts (including reward points used). Not shown for bookings.',
} as const;

type SaleInsightSource = {
  points_earned?: number | null;
  points_redeemed?: number | null;
  points_reversed?: number | null;
  gross_profit?: string | number | null;
  metadata?: Record<string, unknown> | null;
  hideProfit?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readSaleInsights(source: SaleInsightSource | null | undefined) {
  if (!source) {
    return {
      pointsEarned: 0,
      pointsRedeemed: 0,
      pointsReversed: 0,
      reversalReason: '',
      grossProfit: null as number | null,
    };
  }
  const meta = asRecord(source.metadata);
  const loyalty = asRecord(meta.loyalty);
  const billing = asRecord(meta.billing);
  const isBooking =
    source.hideProfit ||
    Boolean(meta.source_booking_id) ||
    String(meta.source || '').trim().toLowerCase() === 'booking';

  const pointsReversed = Math.max(
    0,
    Math.floor(
      num(source.points_reversed) ||
        num(loyalty.points_reversed) ||
        num(loyalty.points_revoked) ||
        num(billing.points_reversed) ||
        num(billing.points_revoked),
    ),
  );
  const pointsEarned = Math.max(
    0,
    Math.floor(
      num(source.points_earned) ||
        num(loyalty.points_earned) + pointsReversed ||
        num(billing.points_earned) + pointsReversed,
    ),
  );
  const pointsRedeemed = Math.max(
    0,
    Math.floor(
      num(source.points_redeemed) || num(loyalty.points_redeemed) || num(billing.reward_points),
    ),
  );
  const reversalReason = String(loyalty.reversal_reason || billing.reversal_reason || '').trim();

  let grossProfit: number | null = null;
  if (!isBooking && source.gross_profit != null && source.gross_profit !== '') {
    const parsed = Number(source.gross_profit);
    grossProfit = Number.isFinite(parsed) ? parsed : null;
  }

  return { pointsEarned, pointsRedeemed, pointsReversed, reversalReason, grossProfit };
}

type Props = {
  source: SaleInsightSource | null | undefined;
  currency?: string | null;
  hideWhenEmpty?: boolean;
};

/** Growth Intelligence–style points + profit chips for orders and sale invoices. */
export function SaleInsightChips({ source, currency, hideWhenEmpty = false }: Props) {
  const { pointsEarned, pointsRedeemed, pointsReversed, reversalReason, grossProfit } =
    readSaleInsights(source);
  const hasPoints = pointsEarned > 0 || pointsRedeemed > 0 || pointsReversed > 0;
  const hasProfit = grossProfit != null;
  if (hideWhenEmpty && !hasPoints && !hasProfit) return null;

  const mixedPoints =
    [pointsEarned > 0, pointsRedeemed > 0, pointsReversed > 0].filter(Boolean).length > 1;
  const profitPositive = (grossProfit ?? 0) >= 0;
  const iconTone = pointsReversed > 0 && !pointsEarned && !pointsRedeemed
    ? 'rose'
    : mixedPoints
      ? 'violet'
      : pointsRedeemed > 0 && pointsEarned <= 0
        ? 'amber'
        : 'green';
  const tone = pointsReversed > 0 && !pointsEarned && !pointsRedeemed
    ? 'negative'
    : mixedPoints
      ? 'neutral'
      : pointsRedeemed > 0 && pointsEarned <= 0
        ? 'warning'
        : 'positive';

  return (
    <View style={styles.row}>
      <LoyaltyMetricTile
        label="Points"
        icon="gift"
        iconTone={iconTone}
        tone={tone}
        help={reversalReason ? `${SALE_INSIGHT_HELP.points} ${reversalReason}` : SALE_INSIGHT_HELP.points}
        value={
          <Text style={styles.pointsValue}>
            {pointsEarned > 0 ? <Text style={{ color: colors.success }}>+{pointsEarned}</Text> : null}
            {pointsEarned > 0 && (pointsRedeemed > 0 || pointsReversed > 0) ? (
              <Text style={{ color: colors.mutedForeground }}> · </Text>
            ) : null}
            {pointsRedeemed > 0 ? (
              <Text style={{ color: colors.warning }}>−{pointsRedeemed}</Text>
            ) : null}
            {pointsRedeemed > 0 && pointsReversed > 0 ? (
              <Text style={{ color: colors.mutedForeground }}> · </Text>
            ) : null}
            {pointsReversed > 0 ? (
              <Text style={{ color: colors.destructive }}>−{pointsReversed} rev</Text>
            ) : null}
            {!hasPoints ? <Text style={{ color: colors.mutedForeground }}>—</Text> : null}
          </Text>
        }
      />
      {hasProfit ? (
        <LoyaltyMetricTile
          label="Profit"
          icon="trending-up"
          iconTone={profitPositive ? 'green' : 'rose'}
          tone={profitPositive ? 'positive' : 'negative'}
          help={SALE_INSIGHT_HELP.profit}
          value={
            <Text
              style={[
                styles.profitValue,
                { color: profitPositive ? colors.success : colors.destructive },
              ]}
            >
              {formatMoney(grossProfit ?? 0, currency || undefined)}
            </Text>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  pointsValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.foreground,
  },
  profitValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
});
