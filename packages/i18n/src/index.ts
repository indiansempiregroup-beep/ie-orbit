export {
  APP_LANGUAGES,
  DEFAULT_LANGUAGE,
  isAppLanguageCode,
  languageSelectOptions,
  normalizeLanguageCode,
  toI18nLanguage,
  toIntlLocale,
  type AppLanguageCode,
  type LanguageOption,
} from './languages';
export { applyAppLanguage, createAppI18n, getI18nInstance, type CreateI18nOptions } from './createI18n';
export {
  getActiveIntlLocale,
  setActiveIntlLocale,
  subscribeActiveIntlLocale,
} from './localeBridge';
export { default as enCatalog } from './locales/en.json';
export { default as hiCatalog } from './locales/hi.json';
export { default as deCatalog } from './locales/de.json';
export { default as frCatalog } from './locales/fr.json';
export { default as esCatalog } from './locales/es.json';
export { default as ptCatalog } from './locales/pt.json';
export { default as arCatalog } from './locales/ar.json';
