import type { Service } from '@ie-orbit/sdk';

type ServiceLike = Service & {
  prices?: Array<{ base_price?: string | number; currency?: string; is_default?: boolean }>;
  images?: Array<{ image_url?: string | null; is_primary?: boolean }>;
};

export function serviceDurationMinutes(service?: ServiceLike | null, fallback = 30): number {
  if (!service) return fallback;
  if (typeof service.duration_minutes === 'number' && service.duration_minutes > 0) {
    return service.duration_minutes;
  }
  const defaultDuration = service.durations?.find((row) => row.is_default) ?? service.durations?.[0];
  if (defaultDuration?.duration_minutes && defaultDuration.duration_minutes > 0) {
    return defaultDuration.duration_minutes;
  }
  return fallback;
}

export function servicePriceAmount(service?: ServiceLike | null): number | null {
  if (!service) return null;
  if (typeof service.price === 'number') return service.price;
  const defaultPrice = service.prices?.find((row) => row.is_default) ?? service.prices?.[0];
  if (defaultPrice?.base_price == null || defaultPrice.base_price === '') return null;
  const amount = Number(defaultPrice.base_price);
  return Number.isFinite(amount) ? amount : null;
}

export function serviceCurrency(service?: ServiceLike | null, fallback = 'INR'): string {
  if (!service) return fallback;
  if (service.currency) return service.currency;
  const defaultPrice = service.prices?.find((row) => row.is_default) ?? service.prices?.[0];
  return defaultPrice?.currency || fallback;
}

export function serviceImageUrl(service?: ServiceLike | null): string | null {
  if (!service) return null;
  if (service.image_url) return service.image_url;
  const primary = service.images?.find((row) => row.is_primary) ?? service.images?.[0];
  return primary?.image_url ?? null;
}

export function formatServicePrice(service?: ServiceLike | null): string | null {
  const amount = servicePriceAmount(service);
  if (amount == null) return null;
  const currency = serviceCurrency(service);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatServiceMeta(service?: ServiceLike | null): string {
  const duration = serviceDurationMinutes(service, 0);
  return [duration ? `${duration} min` : null, formatServicePrice(service)].filter(Boolean).join(' · ') || '—';
}

export function servicesTotalDurationMinutes(services: ServiceLike[], fallback = 30): number {
  if (!services.length) return fallback;
  const total = services.reduce((sum, service) => sum + serviceDurationMinutes(service, 0), 0);
  return total > 0 ? total : fallback;
}

export function servicesTotalPriceLabel(services: ServiceLike[]): string | null {
  if (!services.length) return null;
  const total = services.reduce((sum, service) => sum + (servicePriceAmount(service) ?? 0), 0);
  if (!total) return null;
  const currency = serviceCurrency(services[0]);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(total);
  } catch {
    return `${currency} ${total.toFixed(2)}`;
  }
}

export function servicesSummaryLabel(services: ServiceLike[], nameFor: (service: ServiceLike) => string): string {
  if (!services.length) return '';
  if (services.length === 1) return nameFor(services[0]);
  return `${nameFor(services[0])} + ${services.length - 1} more`;
}
