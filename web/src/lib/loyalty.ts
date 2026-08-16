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
