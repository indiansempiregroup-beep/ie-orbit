import i18n, { type i18n as I18nInstance } from 'i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import { DEFAULT_LANGUAGE, toI18nLanguage } from './languages';

export type CreateI18nOptions = {
  language?: string | null;
  onLanguageChanged?: (language: string) => void | Promise<void>;
};

let sharedInstance: I18nInstance | null = null;

export function getI18nInstance(): I18nInstance {
  if (!sharedInstance) {
    sharedInstance = createAppI18n();
  }
  return sharedInstance;
}

export function createAppI18n(options: CreateI18nOptions = {}): I18nInstance {
  const instance = sharedInstance ?? i18n.createInstance();
  sharedInstance = instance;

  if (!instance.isInitialized) {
    void instance.init({
      compatibilityJSON: 'v4',
      resources: {
        en: { translation: en },
        hi: { translation: hi },
      },
      lng: toI18nLanguage(options.language ?? DEFAULT_LANGUAGE),
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else if (options.language) {
    void instance.changeLanguage(toI18nLanguage(options.language));
  }

  if (options.onLanguageChanged) {
    instance.on('languageChanged', (lng) => {
      void options.onLanguageChanged?.(lng);
    });
  }

  return instance;
}

export async function applyAppLanguage(language?: string | null): Promise<string> {
  const instance = getI18nInstance();
  const next = toI18nLanguage(language);
  if (instance.language !== next) {
    await instance.changeLanguage(next);
  }
  return next;
}
