import { useCallback, useEffect, useState } from 'react';
import { ONBOARDING_DRAFT_KEY } from '../../../config/onboarding';
import type { RegisterWizardFormValues } from '../schemas/registerWizardSchema';
import { getDefaultRegisterValues } from '../schemas/registerWizardSchema';

export function useOnboardingDraft() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const loadDraft = useCallback((): RegisterWizardFormValues => {
    try {
      const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
      if (!raw) return getDefaultRegisterValues();
      return { ...getDefaultRegisterValues(), ...JSON.parse(raw) };
    } catch {
      return getDefaultRegisterValues();
    }
  }, []);

  const saveDraft = useCallback((values: Partial<RegisterWizardFormValues>) => {
    try {
      const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
      const current = raw
        ? { ...getDefaultRegisterValues(), ...JSON.parse(raw) }
        : getDefaultRegisterValues();
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...current, ...values }));
    } catch {
      // ignore
    }
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { hydrated, loadDraft, saveDraft, clearDraft };
}
