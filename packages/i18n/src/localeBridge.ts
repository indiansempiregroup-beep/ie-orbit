import { toIntlLocale } from './languages';

type LocaleListener = (locale: string) => void;

let activeLocale = 'en';
const listeners = new Set<LocaleListener>();

export function getActiveIntlLocale(): string {
  return activeLocale;
}

export function setActiveIntlLocale(languageCode?: string | null): string {
  activeLocale = toIntlLocale(languageCode);
  listeners.forEach((listener) => listener(activeLocale));
  return activeLocale;
}

export function subscribeActiveIntlLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
