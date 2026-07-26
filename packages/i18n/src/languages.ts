export type AppLanguageCode = 'en' | 'en-IN' | 'hi';

export type LanguageOption = {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
};

export const APP_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English (India)' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
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
  if (base === 'en') return value.toLowerCase().startsWith('en-in') ? 'en-IN' : 'en';
  return DEFAULT_LANGUAGE;
}

/** i18n resource language (en-IN uses English catalog). */
export function toI18nLanguage(code?: string | null): 'en' | 'hi' {
  return normalizeLanguageCode(code) === 'hi' ? 'hi' : 'en';
}

/** Intl locale for dates/numbers. */
export function toIntlLocale(code?: string | null): string {
  const normalized = normalizeLanguageCode(code);
  if (normalized === 'hi') return 'hi-IN';
  if (normalized === 'en-IN') return 'en-IN';
  return 'en';
}

export function languageSelectOptions() {
  return APP_LANGUAGES.map((item) => ({
    value: item.code,
    label: `${item.label} · ${item.nativeLabel}`,
  }));
}
