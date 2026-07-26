import { useEffect } from 'react';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-platform/i18n';
import { useAuth } from '../hooks/useAuth';
import { persistLanguagePreference } from '../i18n';

/** Keep i18n + Intl locale in sync with the signed-in user's language. */
export function LanguageSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    const language = user?.language;
    if (!language) return;
    setActiveIntlLocale(language);
    persistLanguagePreference(language);
    void applyAppLanguage(language);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [user?.language]);

  return <>{children}</>;
}
