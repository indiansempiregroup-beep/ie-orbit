import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createAppI18n, normalizeLanguageCode } from '@ie-platform/i18n';

const STORAGE_KEY = 'ie.ops.i18n.language';

export async function readStoredLanguage(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function persistLanguagePreference(language: string) {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, language);
  } catch {
    // ignore
  }
}

const deviceLanguage = Localization.getLocales()?.[0]?.languageTag ?? 'en';

export const i18n = createAppI18n({
  language: normalizeLanguageCode(deviceLanguage),
});

void readStoredLanguage().then((stored) => {
  if (stored) {
    void i18n.changeLanguage(normalizeLanguageCode(stored) === 'hi' ? 'hi' : 'en');
  }
});
