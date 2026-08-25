import { createAppI18n } from '@ie-orbit/i18n';

const STORAGE_KEY = 'ie:i18n:language';

function readStoredLanguage(): string | null {
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

export const i18n = createAppI18n({
  language: readStoredLanguage() || (typeof navigator !== 'undefined' ? navigator.language : 'en'),
  onLanguageChanged: (language) => {
    persistLanguagePreference(language);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}
