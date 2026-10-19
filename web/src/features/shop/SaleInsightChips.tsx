import React from 'react';
import { formatMoney } from '../../lib/currency';
import { MetricTile } from '../bi/components/MetricTile';

export const SALE_INSIGHT_HELP = {
  points:
    'Reward points on this sale or booking. Green (+) means you gave points; amber (−) means the customer used points to pay less.',
  profit:
    'What you kept from this shop sale after stock cost and discounts (including reward points used). Not shown for bookings.',
} as const;

type SaleInsightSource = {
  points_earned?: number | null;
  points_redeemed?: number | null;
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
    return { pointsEarned: 0, pointsRedeemed: 0, grossProfit: null as number | null };
  }
  const meta = asRecord(source.metadata);
  const loyalty = asRecord(meta.loyalty);
  const billing = asRecord(meta.billing);
  const isBooking =
    source.hideProfit ||
    Boolean(meta.source_booking_id) ||
    String(meta.source || '').trim().toLowerCase() === 'booking';

  const pointsEarned = Math.max(
    0,
    Math.floor(
      num(source.points_earned) || num(loyalty.points_earned) || num(billing.points_earned),
    ),
  );
  const pointsRedeemed = Math.max(
    0,
    Math.floor(
      num(source.points_redeemed) || num(loyalty.points_redeemed) || num(billing.reward_points),
    ),
  );

  let grossProfit: number | null = null;
  if (!isBooking && source.gross_profit != null && source.gross_profit !== '') {
    const parsed = Number(source.gross_profit);
    grossProfit = Number.isFinite(parsed) ? parsed : null;
  }

  return { pointsEarned, pointsRedeemed, grossProfit };
}

type Props = {
  source: SaleInsightSource | null | undefined;
  currency?: string | null;
  /** Hide chips entirely when there is nothing to show. */
  hideWhenEmpty?: boolean;
};

/** Growth Intelligence–style points + profit chips for orders and sale invoices. */
export function SaleInsightChips({ source, currency, hideWhenEmpty = false }: Props) {
  const { pointsEarned, pointsRedeemed, grossProfit } = readSaleInsights(source);
  const hasPoints = pointsEarned > 0 || pointsRedeemed > 0;
  const hasProfit = grossProfit != null;
  if (hideWhenEmpty && !hasPoints && !hasProfit) return null;

  const bothPoints = pointsEarned > 0 && pointsRedeemed > 0;
  const pointsTone =
    bothPoints ? 'neutral' : pointsRedeemed > 0 && pointsEarned <= 0 ? 'warning' : 'positive';
  const profitPositive = (grossProfit ?? 0) >= 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <MetricTile
        label="Points"
        icon="gift"
        tone={pointsTone}
        help={SALE_INSIGHT_HELP.points}
        title={SALE_INSIGHT_HELP.points}
        value={
          <>
            {pointsEarned > 0 ? <span style={{ color: '#0f766e' }}>+{pointsEarned}</span> : null}
            {pointsEarned > 0 && pointsRedeemed > 0 ? (
              <span style={{ color: 'var(--muted-foreground)' }}> · </span>
            ) : null}
            {pointsRedeemed > 0 ? <span style={{ color: '#b45309' }}>−{pointsRedeemed}</span> : null}
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
