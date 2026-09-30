import { getActiveIntlLocale } from '@ie-orbit/i18n';

const FALLBACK_CURRENCY = 'USD';

let configuredCurrency: string | undefined;

/** Keep money formatters in sync with the active business currency. */
export function configureBusinessCurrency(currency?: string | null) {
  const normalized = currency?.trim().toUpperCase();
  configuredCurrency = normalized && normalized.length === 3 ? normalized : undefined;
}

export function resolveBusinessCurrency(currency?: string | null): string {
  const normalized = currency?.trim().toUpperCase();
  if (normalized && normalized.length === 3) {
    return normalized;
  }
  if (configuredCurrency) {
    return configuredCurrency;
  }
  return FALLBACK_CURRENCY;
}

export function formatMoney(amount: number, currency?: string | null, locale?: string): string {
  const resolvedCurrency = resolveBusinessCurrency(currency);
  const resolvedLocale = locale || getActiveIntlLocale();
  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: 'currency',
      currency: resolvedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(getActiveIntlLocale(), {
      style: 'currency',
      currency: FALLBACK_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}
