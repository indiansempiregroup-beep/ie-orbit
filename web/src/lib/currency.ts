const FALLBACK_CURRENCY = 'USD';

export function resolveBusinessCurrency(currency?: string | null): string {
  const normalized = currency?.trim().toUpperCase();
  if (normalized && normalized.length === 3) {
    return normalized;
  }
  return FALLBACK_CURRENCY;
}

export function formatMoney(amount: number, currency?: string | null, locale?: string): string {
  const resolvedCurrency = resolveBusinessCurrency(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: resolvedCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: FALLBACK_CURRENCY,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
