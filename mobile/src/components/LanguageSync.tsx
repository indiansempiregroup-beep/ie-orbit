import React, { useEffect } from 'react';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-orbit/i18n';
import { useAuth } from '../contexts/AuthContext';
import { persistLanguagePreference } from '../i18n';

export function LanguageSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    const language = user?.language;
    if (!language) return;
    setActiveIntlLocale(language);
    void persistLanguagePreference(language);
    void applyAppLanguage(language);
  }, [user?.language]);

  return <>{children}</>;
}
