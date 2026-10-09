export type AppLanguageCode = 'en' | 'en-IN' | 'hi' | 'de' | 'fr' | 'es' | 'pt' | 'ar';

export type LanguageOption = {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
};

export const APP_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English (India)' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
];

export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

export function isAppLanguageCode(value: string | null | undefined): value is AppLanguageCode {
  return APP_LANGUAGES.some((item) => item.code === value);
}

export function normalizeLanguageCode(value?: string | null): AppLanguageCode {
  if (!value) return DEFAULT_LANGUAGE;
  if (isAppLanguageCode(value)) return value;
  const base = value.split('-')[0]?.toLowerCase();
  if (base === 'hi') return 'hi';
  if (base === 'de') return 'de';
  if (base === 'fr') return 'fr';
  if (base === 'es') return 'es';
  if (base === 'pt') return 'pt';
  if (base === 'ar') return 'ar';
  if (base === 'en') return value.toLowerCase().startsWith('en-in') ? 'en-IN' : 'en';
  return DEFAULT_LANGUAGE;
}

/** i18n resource language (en-IN uses English catalog). */
export function toI18nLanguage(code?: string | null): 'en' | 'hi' | 'de' | 'fr' | 'es' | 'pt' | 'ar' {
  const normalized = normalizeLanguageCode(code);
  if (normalized === 'hi') return 'hi';
  if (normalized === 'de') return 'de';
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';
  if (normalized === 'pt') return 'pt';
  if (normalized === 'ar') return 'ar';
  return 'en';
}

/** Intl locale for dates/numbers. */
export function toIntlLocale(code?: string | null): string {
  const normalized = normalizeLanguageCode(code);
  if (normalized === 'hi') return 'hi-IN';
  if (normalized === 'en-IN') return 'en-IN';
  if (normalized === 'de') return 'de-DE';
  if (normalized === 'fr') return 'fr-FR';
  if (normalized === 'es') return 'es-ES';
  if (normalized === 'pt') return 'pt-PT';
  if (normalized === 'ar') return 'ar';
  return 'en';
}

export function languageSelectOptions() {
  return APP_LANGUAGES.map((item) => ({
    value: item.code,
    label: `${item.label} · ${item.nativeLabel}`,
  }));
}
