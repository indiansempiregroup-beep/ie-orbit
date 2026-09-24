import { useCallback, useEffect, useState } from 'react';
import { ONBOARDING_DRAFT_KEY, REGISTER_WIZARD_STEPS, type RegisterWizardStepId } from '../../../config/onboarding';
import { createDefaultWeeklyHours } from '../../../lib/businessHours';
import type { RegisterWizardFormValues } from '../schemas/registerWizardSchema';
import { getDefaultRegisterValues } from '../schemas/registerWizardSchema';

type StoredDraft = Partial<RegisterWizardFormValues> & {
  selectedProduct?: string;
  planCode?: string;
  _wizardStepId?: RegisterWizardStepId;
};

function readRawDraft(): string | null {
  try {
    const fromLocal = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (fromLocal) return fromLocal;
    const fromSession = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (fromSession) {
      localStorage.setItem(ONBOARDING_DRAFT_KEY, fromSession);
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      return fromSession;
    }
  } catch {
    // ignore
  }
  return null;
}

function parseStoredDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDraft;
  } catch {
    return null;
  }
}

function toFormValues(parsed: StoredDraft | null): RegisterWizardFormValues {
  const defaults = getDefaultRegisterValues();
  if (!parsed) return defaults;

  const selectedProducts =
    parsed.selectedProducts && parsed.selectedProducts.length > 0
      ? parsed.selectedProducts
      : parsed.selectedProduct
        ? [parsed.selectedProduct as RegisterWizardFormValues['selectedProducts'][number]]
        : defaults.selectedProducts;

  const planCodes = {
    ...defaults.planCodes,
    ...(parsed.planCode && parsed.selectedProduct
      ? { [parsed.selectedProduct]: parsed.planCode }
      : {}),
    ...(parsed.planCodes ?? {}),
  };

  const { _wizardStepId: _step, selectedProduct: _sp, planCode: _pc, ...rest } = parsed;

  return {
    ...defaults,
    ...rest,
    selectedProducts,
    planCodes,
    businessHours: {
      ...createDefaultWeeklyHours(),
      ...(parsed.businessHours ?? {}),
    },
    googleIdToken: '',
  };
}

export function useOnboardingDraft() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const loadDraft = useCallback((): RegisterWizardFormValues => {
    return toFormValues(parseStoredDraft(readRawDraft()));
  }, []);

  const loadDraftStep = useCallback((): RegisterWizardStepId | null => {
    const parsed = parseStoredDraft(readRawDraft());
    const stepId = parsed?._wizardStepId;
    if (!stepId) return null;
    return REGISTER_WIZARD_STEPS.some((step) => step.id === stepId) ? stepId : null;
  }, []);

  const saveDraft = useCallback((
    values: Partial<RegisterWizardFormValues>,
    options?: { stepId?: RegisterWizardStepId },
  ) => {
    try {
      const current = toFormValues(parseStoredDraft(readRawDraft()));
      const previousStep = parseStoredDraft(readRawDraft())?._wizardStepId;
      const { googleIdToken: _googleIdToken, ...safeValues } = { ...current, ...values };
      const payload: StoredDraft = {
        ...safeValues,
        _wizardStepId: options?.stepId ?? previousStep,
      };
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { hydrated, loadDraft, loadDraftStep, saveDraft, clearDraft };
}
