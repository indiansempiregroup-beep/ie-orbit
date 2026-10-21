export type LoyaltyPrefs = {
  enabled: boolean;
  points_per_currency_unit: number;
  max_redeem_percent: number;
  min_redeem_points: number;
  earn_points_per_100: number;
};

export function readLoyaltyPrefs(settings?: Record<string, unknown> | null): LoyaltyPrefs {
  const raw = settings?.loyalty_preferences;
  const prefs = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: Boolean(prefs.enabled),
    points_per_currency_unit: Math.max(1, Number(prefs.points_per_currency_unit ?? 10) || 10),
    max_redeem_percent: Math.min(100, Math.max(0, Number(prefs.max_redeem_percent ?? 50) || 50)),
    min_redeem_points: Math.max(0, Number(prefs.min_redeem_points ?? 10) || 10),
    earn_points_per_100: Math.max(0, Number(prefs.earn_points_per_100 ?? 1) || 0),
  };
}

export function isLoyaltyEntitled(features?: string[] | null): boolean {
  return Boolean(features?.includes('reward_points') || features?.includes('shopie_loyalty'));
}

export function maxRedeemablePoints(amount: number, prefs: LoyaltyPrefs, balance: number): number {
  if (!prefs.enabled || balance <= 0 || amount <= 0) return 0;
  const rate = Math.max(1, prefs.points_per_currency_unit);
  const maxByPercent = Math.floor(((amount * prefs.max_redeem_percent) / 100) * rate);
  return Math.max(0, Math.min(balance, maxByPercent));
}

export function redeemDiscountAmount(points: number, prefs: LoyaltyPrefs): number {
  if (points <= 0) return 0;
  return points / Math.max(1, prefs.points_per_currency_unit);
}

/** Points earned for a paid bill amount (matches backend LoyaltyService.earn_points_for_spend). */
export function earnPointsForSpend(amount: number, prefs: LoyaltyPrefs): number {
  if (!prefs.enabled || prefs.earn_points_per_100 <= 0 || amount <= 0) return 0;
  return Math.floor((amount * prefs.earn_points_per_100) / 100);
}

export type LoyaltyDocument = {
  pointsEarned: number;
  pointsReversed: number;
  pointsRedeemed: number;
  remainingEarned: number;
  reversalReason: string;
  discountAmount: number;
  refunded: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function intPoints(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

/** Original earn, used, and reversed points from a booking / order / invoice. */
export function readLoyaltyDocument(source?: Record<string, unknown> | null): LoyaltyDocument {
  const root = asRecord(source);
  const loyalty = asRecord(root.loyalty);
  const meta = asRecord(root.metadata);
  const nested = Object.keys(loyalty).length ? loyalty : asRecord(meta.loyalty);
  const billing = asRecord(meta.billing);
  const reversed = intPoints(
    nested.points_reversed ||
      nested.points_revoked ||
      billing.points_reversed ||
      billing.points_revoked ||
      root.points_reversed,
  );
  const storedNested = intPoints(nested.points_earned);
  const storedRoot = intPoints(root.points_earned || billing.points_earned);
  const hasSummary = nested.remaining_earned != null && nested.remaining_earned !== '';
  const earned = hasSummary
    ? Math.max(storedNested, storedRoot)
    : Math.max(storedRoot, storedNested + reversed);
  const redeemed = intPoints(
    nested.points_redeemed || billing.reward_points || root.points_redeemed,
  );
  return {
    pointsEarned: earned,
    pointsReversed: reversed,
    pointsRedeemed: redeemed,
    remainingEarned: hasSummary
      ? intPoints(nested.remaining_earned)
      : Math.max(0, earned - reversed),
    reversalReason: String(nested.reversal_reason || billing.reversal_reason || '').trim(),
    discountAmount: Number(nested.discount_amount || billing.reward_discount || 0) || 0,
    refunded: Boolean(nested.refunded || nested.earn_reversed),
  };
}

/** Single-line loyalty callout for bills. Empty when loyalty is off or nothing earned. */
export function loyaltyBillHighlight(options: {
  enabled: boolean;
  pointsEarned?: number;
  pointsToEarn?: number;
  pointsReversed?: number;
  reversalReason?: string;
  /** Omit or null when balance is unknown — earned line still shows. */
  pointsBalance?: number | null;
}): string {
  if (!options.enabled) return '';
  const earned = Math.max(0, Math.floor(Number(options.pointsEarned) || 0));
  const pending = Math.max(0, Math.floor(Number(options.pointsToEarn) || 0));
  const reversed = Math.max(0, Math.floor(Number(options.pointsReversed) || 0));
  const why = String(options.reversalReason || '').trim();
  if (earned <= 0 && pending <= 0 && reversed <= 0) return '';
  const hasBalance =
    options.pointsBalance != null && Number.isFinite(Number(options.pointsBalance));
  const balance = hasBalance ? Math.max(0, Math.floor(Number(options.pointsBalance) || 0)) : null;
  const parts: string[] = [];
  if (earned > 0) parts.push(`+${earned} points earned`);
  else if (pending > 0) parts.push(`+${pending} points to earn`);
  if (reversed > 0) parts.push(`−${reversed} reversed${why ? ` · ${why}` : ''}`);
  else if (balance != null && balance > 0) parts.push(`${balance} pts total`);
  return parts.join(' · ');
}
