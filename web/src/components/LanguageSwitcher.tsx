import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  APP_LANGUAGES,
  applyAppLanguage,
  normalizeLanguageCode,
  setActiveIntlLocale,
  type AppLanguageCode,
} from '@ie-orbit/i18n';
import { persistLanguagePreference, readStoredLanguage } from '../i18n';

type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
};

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<AppLanguageCode>(() =>
    normalizeLanguageCode(readStoredLanguage() || i18n.language || 'en'),
  );

  useEffect(() => {
    const onChanged = (lng: string) => {
      const stored = readStoredLanguage();
      setSelected(normalizeLanguageCode(stored || lng));
    };
    i18n.on('languageChanged', onChanged);
    return () => {
      i18n.off('languageChanged', onChanged);
    };
  }, [i18n]);

  async function onChange(next: string) {
    const code = normalizeLanguageCode(next);
    setSelected(code);
    setActiveIntlLocale(code);
    persistLanguagePreference(code);
    await applyAppLanguage(code);
  }

  return (
    <label className={`language-switcher${compact ? ' language-switcher--compact' : ''}${className ? ` ${className}` : ''}`}>
      <span className="language-switcher__label">{t('common.language')}</span>
      <select
        className="language-switcher__select"
        value={selected}
        onChange={(event) => void onChange(event.target.value)}
        aria-label={t('common.language')}
      >
        {APP_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
