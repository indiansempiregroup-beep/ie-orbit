import { createAppI18n, syncDocumentLocale } from '@ie-orbit/i18n';

const STORAGE_KEY = 'ie:i18n:language';

export function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistLanguagePreference(language: string) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore
  }
}

const initialLanguage =
  readStoredLanguage() || (typeof navigator !== 'undefined' ? navigator.language : 'en');

export const i18n = createAppI18n({
  language: initialLanguage,
  onLanguageChanged: (language) => {
    // Keep stored preference when catalog language collapses (e.g. en-IN → en).
    const preferred = readStoredLanguage() || language;
    persistLanguagePreference(preferred);
    syncDocumentLocale(preferred);
  },
});

syncDocumentLocale(initialLanguage);
