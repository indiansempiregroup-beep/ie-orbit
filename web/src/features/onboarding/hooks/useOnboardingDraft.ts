import { useCallback, useEffect, useState } from 'react';
import { ONBOARDING_DRAFT_KEY } from '../../../config/onboarding';
import { createDefaultWeeklyHours } from '../../../lib/businessHours';
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
      const parsed = JSON.parse(raw) as Partial<RegisterWizardFormValues> & {
        selectedProduct?: string;
        planCode?: string;
      };
      const selectedProducts =
        parsed.selectedProducts && parsed.selectedProducts.length > 0
          ? parsed.selectedProducts
          : parsed.selectedProduct
            ? [parsed.selectedProduct as RegisterWizardFormValues['selectedProducts'][number]]
            : getDefaultRegisterValues().selectedProducts;
      const planCodes = {
        ...getDefaultRegisterValues().planCodes,
        ...(parsed.planCode && parsed.selectedProduct
          ? { [parsed.selectedProduct]: parsed.planCode }
          : {}),
        ...(parsed.planCodes ?? {}),
      };
      return {
        ...getDefaultRegisterValues(),
        ...parsed,
        selectedProducts,
        planCodes,
        businessHours: {
          ...createDefaultWeeklyHours(),
          ...(parsed.businessHours ?? {}),
        },
      };
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
      const { googleIdToken: _googleIdToken, ...safeValues } = { ...current, ...values };
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(safeValues));
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
