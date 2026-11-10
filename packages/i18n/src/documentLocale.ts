import { toI18nLanguage, toIntlLocale, type AppLanguageCode, normalizeLanguageCode } from './languages';

export function isRtlLanguage(language?: string | null): boolean {
  return toI18nLanguage(language) === 'ar';
}

/** BCP 47 tag for <html lang>. */
export function toHtmlLang(language?: string | null): string {
  return toIntlLocale(language);
}

export function syncDocumentLocale(language?: string | null): AppLanguageCode {
  const normalized = normalizeLanguageCode(language);
  if (typeof document === 'undefined') return normalized;
  document.documentElement.lang = toHtmlLang(normalized);
  document.documentElement.dir = isRtlLanguage(normalized) ? 'rtl' : 'ltr';
  return normalized;
}
