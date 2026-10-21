import React from 'react';
import { formatMoney } from '../../lib/currency';
import { MetricTile } from '../bi/components/MetricTile';

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
  /** When true, hide profit (bookings). */
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

/** Resolve earn/redeem/profit for order or books sale voucher payloads. */
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
  /** Hide chips entirely when there is nothing to show. */
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
  const pointsTone =
    pointsReversed > 0 && !pointsEarned && !pointsRedeemed
      ? 'negative'
      : mixedPoints
        ? 'neutral'
        : pointsRedeemed > 0 && pointsEarned <= 0
          ? 'warning'
          : 'positive';
  const profitPositive = (grossProfit ?? 0) >= 0;
  const help = reversalReason ? `${SALE_INSIGHT_HELP.points} ${reversalReason}` : SALE_INSIGHT_HELP.points;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <MetricTile
        label="Points"
        icon="gift"
        tone={pointsTone}
        help={help}
        title={help}
        value={
          <>
            {pointsEarned > 0 ? <span style={{ color: '#0f766e' }}>+{pointsEarned}</span> : null}
            {pointsEarned > 0 && (pointsRedeemed > 0 || pointsReversed > 0) ? (
              <span style={{ color: 'var(--muted-foreground)' }}> · </span>
            ) : null}
            {pointsRedeemed > 0 ? <span style={{ color: '#b45309' }}>−{pointsRedeemed}</span> : null}
            {pointsRedeemed > 0 && pointsReversed > 0 ? (
              <span style={{ color: 'var(--muted-foreground)' }}> · </span>
            ) : null}
            {pointsReversed > 0 ? <span style={{ color: '#be123c' }}>−{pointsReversed} rev</span> : null}
            {!hasPoints ? <span style={{ color: 'var(--muted-foreground)' }}>—</span> : null}
          </>
        }
      />
      {hasProfit ? (
        <MetricTile
          label="Profit"
          icon="trending-up"
          tone={profitPositive ? 'positive' : 'negative'}
          help={SALE_INSIGHT_HELP.profit}
          title={SALE_INSIGHT_HELP.profit}
          value={formatMoney(grossProfit ?? 0, currency)}
        />
      ) : null}
    </div>
  );
}
