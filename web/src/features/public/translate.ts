import enCatalog from '../../../../packages/i18n/src/locales/en.json';

/** Minimal shape of i18next `t` used by public content builders. */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => unknown;

/** Read a dotted key from the English catalog (used for SEO / prerender, no i18n runtime needed). */
export function readEnglishCatalog(key: string): unknown {
  let node: unknown = enCatalog;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Wrap `t` so object/array keys come back structured (returnObjects) instead of as strings. */
export function objectReader(t: TranslateFn): (key: string) => unknown {
  return (key) => t(key, { returnObjects: true });
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => asRecord(item) !== null)
    : [];
}
