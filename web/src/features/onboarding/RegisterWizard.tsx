import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Check, CalendarDays, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { ColorInput } from '../../components/ColorInput';
import { LogoUploadField } from '../../components/LogoUploadField';
import { BusinessHoursEditor } from '../../components/BusinessHoursEditor';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { preferHumanAddress, placeToAddressFields } from '../../lib/placeAddress';
import { placesCountryCodeFromName } from '../../lib/placesCountryCode';
import { WizardShell } from './components/WizardShell';
import { useOnboardingDraft } from './hooks/useOnboardingDraft';
import { provisionWorkspace } from './provisionWorkspace';
import {
  captureAffiliateCodeFromLocation,
  clearStoredAffiliateCode,
  persistAffiliateCode,
} from './affiliateCode';
import {
  getDefaultRegisterValues,
  registerWizardSchema,
  stepFieldMap,
  type RegisterWizardFormValues,
} from './schemas/registerWizardSchema';
import {
  BUSINESS_CATEGORIES,
  CURRENCIES,
  DATE_FORMATS,
  detectDefaultCurrency,
  detectDefaultTimezone,
  INDUSTRIES,
  LANGUAGES,
  REGISTER_WIZARD_STEPS,
  TIMEZONES,
  TIME_FORMATS,
  WEEK_START_DAYS,
  type RegisterWizardStepId,
} from '../../config/onboarding';
import { PRODUCT_CATALOG, getProductName, getRecommendedPlanCode, isRecommendedPlanCode, planSeatLine, stripPlanProductPrefix } from '../../config/products';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { useAuthContext } from '../../contexts/AuthContext';
import { createAuthenticatedClient, getApiErrorMessage } from '../../lib/apiClient';
import { decodeGoogleIdToken, isGoogleAccountNotRegistered } from '../../lib/googleAuth';
import { summarizeWeeklyHours } from '../../lib/businessHours';
import { usePageMeta } from '../../hooks/usePageMeta';
import { VERIFY_EMAIL_PATH } from '../../utils/roles';

const FALLBACK_PACKAGES: Record<string, BillingPlanCatalogItem[]> = {
  appointie: [
    {
      product_code: 'appointie',
      plan_code: 'appointie-starter',
      name: 'Orbit Appoint Starter',
      description: 'White-label customer app plus scheduling for a single location.',
      billing_interval: 'monthly',
      trial_days: 45,
      is_default: true,
      max_staff: 2,
      max_branches: 1,
      max_extra_staff: 1,
      max_extra_offices: 0,
      currency: 'INR',
    },
    {
      product_code: 'appointie',
      plan_code: 'appointie-pro',
      name: 'Orbit Appoint Pro',
      description: 'Ad-free white-label customer app, WhatsApp reminders, and full BI.',
      billing_interval: 'monthly',
      trial_days: 45,
      is_default: false,
      max_staff: 5,
      max_branches: 2,
      max_extra_staff: null,
      max_extra_offices: null,
      currency: 'INR',
    },
  ],
  shopie: [
    {
      product_code: 'shopie',
      plan_code: 'shopie-starter',
      name: 'Orbit Mart Starter',
      description: 'White-label customer app plus counter POS, online orders, and returns.',
      billing_interval: 'monthly',
      trial_days: 45,
      is_default: true,
      max_staff: 2,
      max_branches: 1,
      max_extra_staff: 1,
      max_extra_offices: 0,
      currency: 'INR',
    },
    {
      product_code: 'shopie',
      plan_code: 'shopie-pro',
      name: 'Orbit Mart Pro',
      description: 'Ad-free white-label customer app, Instant Delivery with Porter/Shiprocket, GST books, and Grow.',
      billing_interval: 'monthly',
      trial_days: 45,
      is_default: false,
      max_staff: 5,
      max_branches: 2,
      max_extra_staff: null,
      max_extra_offices: null,
      currency: 'INR',
    },
  ],
};

function formatInr(paise?: number | null) {
  if (paise == null) return null;
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function planTitle(plan: Pick<BillingPlanCatalogItem, 'name'> | string) {
  const name = typeof plan === 'string' ? plan : plan.name;
  return stripPlanProductPrefix(name);
}

export function RegisterWizard() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('register.metaTitle'),
    description: t('register.metaDescription'),
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const auth = useAuthContext();
  const googlePrefill = (location.state ?? null) as {
    googleIdToken?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    freshStart?: boolean;
  } | null;
  const { hydrated, loadDraft, loadDraftStep, saveDraft, clearDraft } = useOnboardingDraft();
  const [stepIndex, setStepIndex] = useState(0);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [brandingLogoFile, setBrandingLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [affiliateCode, setAffiliateCode] = useState(() => captureAffiliateCodeFromLocation());
  const [ownerOtpSending, setOwnerOtpSending] = useState(false);
  const [ownerOtpSent, setOwnerOtpSent] = useState(false);
  const draftLoadedRef = useRef(false);
  const skipNextDraftSaveRef = useRef(false);

  const currentStep = REGISTER_WIZARD_STEPS[stepIndex]?.id ?? 'business';

  const form = useForm<RegisterWizardFormValues>({
    resolver: zodResolver(registerWizardSchema),
    defaultValues: getDefaultRegisterValues(),
    mode: 'onBlur',
  });

  const { register, watch, setValue, trigger, getValues, clearErrors, formState: { errors } } = form;
  const values = watch();
  const publicClient = useMemo(() => createAuthenticatedClient(), []);
  const catalogQuery = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => (await publicClient.billing.publicPlans()).data,
    retry: false,
  });
  const catalogPlans = catalogQuery.data?.plans ?? [];

  function plansForProduct(productId: string) {
    const fromCatalog = catalogPlans.filter((plan) => plan.product_code === productId);
    return fromCatalog.length > 0 ? fromCatalog : FALLBACK_PACKAGES[productId] ?? [];
  }

  async function sendOwnerOtp() {
    const email = getValues('email')?.trim();
    if (!email) return;
    setOwnerOtpSending(true);
    try {
      await publicClient.auth.sendOtp({
        client: 'ops',
        channel: 'email',
        identifier: email,
        purpose: 'signup',
      });
      setOwnerOtpSent(true);
    } catch (err) {
      setProvisionError(getApiErrorMessage(err, t('register.otpFailed')));
    } finally {
      setOwnerOtpSending(false);
    }
  }

  useEffect(() => {
    if (!brandingLogoFile) {
      setLogoPreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(brandingLogoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [brandingLogoFile]);

  useEffect(() => {
    const fromUrl = captureAffiliateCodeFromLocation(searchParams.toString());
    if (fromUrl) setAffiliateCode(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated || draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    if (googlePrefill?.freshStart) {
      clearDraft();
      form.reset(getDefaultRegisterValues());
      setStepIndex(0);
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
      return;
    }

    const draft = loadDraft();
    const savedStep = loadDraftStep();
    const detectedTz = detectDefaultTimezone();
    const detectedCurrency = detectDefaultCurrency();
    const timezone = (
      draft.timezone && TIMEZONES.includes(draft.timezone as (typeof TIMEZONES)[number])
        ? draft.timezone
        : TIMEZONES.includes(detectedTz as (typeof TIMEZONES)[number])
          ? detectedTz
          : 'UTC'
    ) as RegisterWizardFormValues['timezone'];

    skipNextDraftSaveRef.current = true;
    form.reset({
      ...draft,
      currency: draft.currency || detectedCurrency,
      timezone,
      ...(googlePrefill?.googleIdToken
        ? {
            googleIdToken: googlePrefill.googleIdToken,
            email: googlePrefill.email || draft.email,
            firstName: googlePrefill.firstName || draft.firstName,
            lastName: googlePrefill.lastName || draft.lastName,
          }
        : {}),
    });
    if (savedStep) {
      const index = REGISTER_WIZARD_STEPS.findIndex((step) => step.id === savedStep);
      if (index >= 0 && savedStep !== 'provision') setStepIndex(index);
    }
  }, [
    hydrated,
    form,
    loadDraft,
    loadDraftStep,
    googlePrefill?.googleIdToken,
    googlePrefill?.email,
    googlePrefill?.firstName,
    googlePrefill?.lastName,
    googlePrefill?.freshStart,
    clearDraft,
    location.pathname,
    location.search,
    navigate,
  ]);

  function snapshotForDraft(stepId: RegisterWizardStepId = currentStep): RegisterWizardFormValues {
    const stored = loadDraft();
    const live = getValues();
    const fields = [...(stepFieldMap[stepId as keyof typeof stepFieldMap] ?? [])] as Array<
      keyof RegisterWizardFormValues
    >;
    const next: RegisterWizardFormValues = {
      ...stored,
      googleIdToken: live.googleIdToken || stored.googleIdToken || '',
    };
    for (const field of fields) {
      next[field] = live[field] as never;
    }
    if (stepId === 'business') {
      next.latitude = live.latitude;
      next.longitude = live.longitude;
    }
    return next;
  }

  function persistDraft(stepId: RegisterWizardStepId = currentStep) {
    saveDraft(snapshotForDraft(stepId), { stepId: stepId === 'provision' ? 'review' : stepId });
  }

  useEffect(() => {
    if (!hydrated || !draftLoadedRef.current) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      persistDraft(currentStep === 'provision' ? 'review' : currentStep);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values, hydrated, currentStep]);

  useEffect(() => {
    const next = { ...values.planCodes };
    let changed = false;
    for (const productId of values.selectedProducts) {
      const plans = plansForProduct(productId);
      if (!plans.length) continue;
      if (plans.some((plan) => plan.plan_code === next[productId])) continue;
      const fallbackCode = getRecommendedPlanCode(plans);
      const fallback = plans.find((plan) => plan.plan_code === fallbackCode) ?? plans[0];
      if (fallback) {
        next[productId] = fallback.plan_code;
        changed = true;
      }
    }
    if (changed) setValue('planCodes', next, { shouldValidate: true });
  }, [catalogPlans, values.selectedProducts, values.planCodes, setValue]);

  async function goNext() {
    const fields = [...(stepFieldMap[currentStep as keyof typeof stepFieldMap] ?? [])].filter(
      (field) =>
        !(values.googleIdToken && field === 'ownerOtpCode'),
    ) as (keyof RegisterWizardFormValues)[];
    const valid = fields.length === 0 ? true : await trigger(fields);
    if (!valid) return;
    persistDraft(currentStep);
    if (currentStep === 'review') {
      await handleProvision();
      return;
    }
    const restored: RegisterWizardFormValues = {
      ...loadDraft(),
      googleIdToken: getValues('googleIdToken') || '',
    };
    skipNextDraftSaveRef.current = true;
    form.reset(restored, { keepDefaultValues: true });
    setStepIndex((index) => Math.min(index + 1, REGISTER_WIZARD_STEPS.length - 1));
  }

  function goBack() {
    persistDraft(currentStep);
    const previous = Math.max(stepIndex - 1, 0);
    const restored: RegisterWizardFormValues = {
      ...loadDraft(),
      googleIdToken: getValues('googleIdToken') || '',
    };
    skipNextDraftSaveRef.current = true;
    form.reset(restored, { keepDefaultValues: true });
    setStepIndex(previous);
  }

  function jumpToStep(stepId: RegisterWizardStepId) {
    const index = REGISTER_WIZARD_STEPS.findIndex((step) => step.id === stepId);
    if (index >= 0) setStepIndex(index);
  }

  function applyPlace(place: Parameters<typeof preferHumanAddress>[0]) {
    const resolved = placeToAddressFields(preferHumanAddress(place, getValues('address')));
    const cleared =
      !resolved.address && resolved.latitude == null && resolved.longitude == null;
    setValue('address', resolved.address, { shouldDirty: true, shouldValidate: true });
    if (cleared) {
      setValue('addressLine2', '', { shouldDirty: true });
    }
    setValue('city', resolved.city, { shouldDirty: true, shouldValidate: true });
    setValue('state', resolved.state, { shouldDirty: true, shouldValidate: true });
    setValue('country', resolved.country, { shouldDirty: true, shouldValidate: true });
    setValue('postalCode', resolved.postalCode, { shouldDirty: true, shouldValidate: true });
    setValue('latitude', resolved.latitude, { shouldDirty: true });
    setValue('longitude', resolved.longitude, { shouldDirty: true });
    clearErrors(['address', 'city', 'state', 'country', 'postalCode']);
  }

  function clearCurrentStep() {
    const defaults = getDefaultRegisterValues();
    const fields = [...(stepFieldMap[currentStep as keyof typeof stepFieldMap] ?? [])] as Array<
      keyof RegisterWizardFormValues
    >;
    // Rebuild from the saved draft so unmounted steps (e.g. Business while on Owner)
    // are not wiped from react-hook-form's in-memory values.
    const next: RegisterWizardFormValues = {
      ...loadDraft(),
      googleIdToken: getValues('googleIdToken') || '',
    };
    for (const field of fields) {
      next[field] = defaults[field] as never;
    }
    if (currentStep === 'business') {
      next.latitude = null;
      next.longitude = null;
    }
    if (currentStep === 'owner') {
      setAffiliateCode('');
      persistAffiliateCode('');
      setOwnerOtpSent(false);
    }
    if (currentStep === 'branding') {
      setBrandingLogoFile(null);
    }
    skipNextDraftSaveRef.current = true;
    form.reset(next, { keepDefaultValues: true });
    if (fields.length) clearErrors(fields);
    saveDraft(next, { stepId: currentStep });
  }

  function handleCancel() {
    clearDraft();
    form.reset(getDefaultRegisterValues());
    navigate('/');
  }

  async function handleProvision() {
    setProvisioning(true);
    setProvisionError(null);
    setStepIndex(REGISTER_WIZARD_STEPS.findIndex((step) => step.id === 'provision'));
    try {
      const parsed = registerWizardSchema.parse(values);
      const payload = await provisionWorkspace({
        values: parsed,
        logoFile: brandingLogoFile,
        affiliateCode,
      });
      await auth.bootstrapSession(payload);
      clearStoredAffiliateCode();
      clearDraft();
      navigate(VERIFY_EMAIL_PATH, { replace: true, state: { fromOnboarding: true } });
    } catch (err) {
      setProvisionError(getApiErrorMessage(err, t('register.provisionFailed')));
      setStepIndex(REGISTER_WIZARD_STEPS.findIndex((step) => step.id === 'review'));
    } finally {
      setProvisioning(false);
    }
  }

  function renderBusinessStep() {
    const addressLocked = values.latitude != null && values.longitude != null;
    const readOnlyFieldStyle = addressLocked ? { background: '#f8fafc' } : undefined;

    return (
      <div className="wizard-form">
        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.businessProfile')}</h2>
            <p>{t('register.businessProfileHint')}</p>
          </div>
          <div className="wizard-form-grid">
            <Input
              label={t('register.businessName')}
              required
              autoComplete="organization"
              {...register('businessName')}
              error={errors.businessName?.message}
              aria-invalid={Boolean(errors.businessName)}
            />
            <Select
              label={t('register.businessCategory')}
              required
              options={[{ value: '', label: t('register.selectCategory') }, ...BUSINESS_CATEGORIES.map((c) => ({ value: c, label: c }))]}
              {...register('businessCategory')}
              error={errors.businessCategory?.message}
            />
            {values.businessCategory === 'Other' ? (
              <Input
                label={t('register.describeCategory')}
                required
                {...register('businessCategoryOther')}
                error={errors.businessCategoryOther?.message}
              />
            ) : null}
            <Select
              label={t('register.industry')}
              required
              options={[{ value: '', label: t('register.selectIndustry') }, ...INDUSTRIES.map((c) => ({ value: c, label: c }))]}
              {...register('industry')}
              error={errors.industry?.message}
            />
            {values.industry === 'Other' ? (
              <Input
                label={t('register.describeIndustry')}
                required
                {...register('industryOther')}
                error={errors.industryOther?.message}
              />
            ) : null}
            <Input
              label={t('register.businessEmail')}
              required
              type="email"
              autoComplete="off"
              {...register('businessEmail')}
              error={errors.businessEmail?.message}
            />
            <Input
              label={t('register.businessPhone')}
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              {...register('businessPhone')}
              error={errors.businessPhone?.message}
            />
            <Input label={t('register.websiteOptional')} {...register('website')} error={errors.website?.message} />
          </div>
        </section>

        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.location')}</h2>
            <p>{t('register.locationHint')}</p>
          </div>
          <div className="wizard-form-grid">
            <div className="wizard-form-span">
              <AddressLocationPicker
                label={t('register.businessAddress')}
                value={values.address}
                latitude={values.latitude}
                longitude={values.longitude}
                countryCode={placesCountryCodeFromName(values.country)}
                onChangeText={(value) => setValue('address', value, { shouldDirty: true, shouldValidate: true })}
                onPlaceSelected={applyPlace}
              />
              {errors.address ? <span className="field-error">{errors.address.message}</span> : null}
            </div>
            <Input
              label={t('register.line2Label')}
              required
              placeholder={t('register.line2Placeholder')}
              {...register('addressLine2')}
              error={errors.addressLine2?.message}
            />
            <Input
              label={t('customers.country')}
              required
              readOnly={addressLocked}
              style={readOnlyFieldStyle}
              {...register('country')}
              error={errors.country?.message}
            />
            <Input
              label={t('customers.state')}
              required
              readOnly={addressLocked}
              style={readOnlyFieldStyle}
              {...register('state')}
              error={errors.state?.message}
            />
            <Input
              label={t('customers.city')}
              required
              readOnly={addressLocked}
              style={readOnlyFieldStyle}
              {...register('city')}
              error={errors.city?.message}
            />
            <Input
              label={t('customers.postalCode')}
              required
              readOnly={addressLocked}
              style={readOnlyFieldStyle}
              {...register('postalCode')}
              error={errors.postalCode?.message}
            />
          </div>
        </section>
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="wizard-form">
        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.ownerAccount')}</h2>
            <p>{t('register.ownerHint')}</p>
          </div>
          <div className="wizard-form-grid">
            <Input
              label={t('common.firstName')}
              required
              {...register('firstName')}
              autoComplete="given-name"
              error={errors.firstName?.message}
            />
            <Input
              label={t('common.lastName')}
              required
              {...register('lastName')}
              autoComplete="family-name"
              error={errors.lastName?.message}
            />
            <Input
              label={t('customers.displayName')}
              required
              {...register('displayName')}
              autoComplete="nickname"
              error={errors.displayName?.message}
            />
            <label className="ui-field" htmlFor="email">
              <span className="ui-field-label">
                {t('common.email')}
                <span className="ui-field-required" aria-hidden="true">
                  {' '}
                  *
                </span>
              </span>
              <div
                className={[
                  'wizard-input-group',
                  errors.email ? 'is-error' : '',
                  values.googleIdToken ? 'is-readonly' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  id="email"
                  type="email"
                  className="ui-control"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email', {
                    onChange: () => {
                      if (ownerOtpSent) setOwnerOtpSent(false);
                      if (values.ownerOtpCode) setValue('ownerOtpCode', '', { shouldDirty: true });
                    },
                  })}
                  readOnly={Boolean(values.googleIdToken)}
                />
                {values.googleIdToken ? (
                  <span className="wizard-input-group-note">{t('register.verified')}</span>
                ) : (
                  <button
                    type="button"
                    className="wizard-input-group-btn"
                    disabled={!values.email || ownerOtpSending}
                    onClick={() => void sendOwnerOtp()}
                  >
                    {ownerOtpSending ? '…' : ownerOtpSent ? t('register.resend') : t('register.send')}
                  </button>
                )}
              </div>
              {errors.email?.message ? (
                <span role="alert" className="field-error">
                  {errors.email.message}
                </span>
              ) : ownerOtpSent && !values.googleIdToken ? (
                <span className="wizard-otp-sent">{t('register.codeSent')}</span>
              ) : null}
            </label>
            {!values.googleIdToken ? (
              <Input
                label={t('register.verificationCode')}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                {...register('ownerOtpCode')}
                error={errors.ownerOtpCode?.message}
                placeholder={t('register.codePlaceholder')}
              />
            ) : null}
            <Input
              label={t('register.mobile')}
              required
              type="tel"
              inputMode="numeric"
              {...register('mobile')}
              autoComplete="tel"
              error={errors.mobile?.message}
            />
          </div>
          {!values.googleIdToken ? (
            <div className="wizard-google-slot">
              <GoogleSignInButton
                hideOriginHint
                disabled={auth.loading}
                onIdToken={async (idToken) => {
                  try {
                    await auth.loginWithGoogle(idToken);
                    navigate('/auth', { replace: true });
                  } catch (err) {
                    if (!isGoogleAccountNotRegistered(err)) throw err;
                    const claims = decodeGoogleIdToken(idToken);
                    setValue('googleIdToken', idToken, { shouldDirty: true });
                    if (claims.email) {
                      setValue('email', claims.email, { shouldDirty: true, shouldValidate: true });
                    }
                    if (claims.given_name) {
                      setValue('firstName', claims.given_name, { shouldDirty: true, shouldValidate: true });
                    }
                    if (claims.family_name) {
                      setValue('lastName', claims.family_name, { shouldDirty: true, shouldValidate: true });
                    }
                    if (!values.displayName && (claims.given_name || claims.family_name)) {
                      setValue(
                        'displayName',
                        [claims.given_name, claims.family_name].filter(Boolean).join(' '),
                        { shouldDirty: true, shouldValidate: true },
                      );
                    }
                    setOwnerOtpSent(false);
                    setValue('ownerOtpCode', '', { shouldDirty: true });
                  }
                }}
              />
            </div>
          ) : null}
        </section>

        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.agreements')}</h2>
            <p>{t('register.agreementsHint')}</p>
          </div>
          <div className="wizard-form-grid">
            <label className="auth-checkbox wizard-form-span">
              <input type="checkbox" {...register('acceptTerms')} />
              <span>
                <Trans
                  i18nKey="register.acceptTerms"
                  components={{ link: <Link to="/terms" target="_blank" rel="noreferrer" /> }}
                />
              </span>
            </label>
            {errors.acceptTerms ? <span className="field-error wizard-form-span">{errors.acceptTerms.message}</span> : null}
            <label className="auth-checkbox wizard-form-span">
              <input type="checkbox" {...register('acceptPrivacy')} />
              <span>
                <Trans
                  i18nKey="register.acceptPrivacy"
                  components={{ link: <Link to="/privacy" target="_blank" rel="noreferrer" /> }}
                />
              </span>
            </label>
            {errors.acceptPrivacy ? (
              <span className="field-error wizard-form-span">{errors.acceptPrivacy.message}</span>
            ) : null}
            <div className="wizard-form-span">
              <Input
                label={t('register.affiliateCode')}
                value={affiliateCode}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase();
                  setAffiliateCode(next);
                  persistAffiliateCode(next);
                }}
                autoComplete="off"
              />
              <p className="wizard-hint">{t('register.affiliateHint')}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function toggleProduct(productId: RegisterWizardFormValues['selectedProducts'][number]) {
    const selected = values.selectedProducts.includes(productId);
    if (selected && values.selectedProducts.length === 1) return;
    const next = selected
      ? values.selectedProducts.filter((id) => id !== productId)
      : [...values.selectedProducts, productId];
    setValue('selectedProducts', next, { shouldValidate: true, shouldDirty: true });
  }

  function renderPreferencesStep() {
    return (
      <div className="wizard-form">
        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.preferencesTitle')}</h2>
            <p>{t('register.preferencesHint')}</p>
          </div>
          <div className="wizard-form-grid">
            <Select
              label={t('common.currency')}
              options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
              {...register('currency')}
              error={errors.currency?.message}
            />
            <Select
              label={t('common.timezone')}
              options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
              {...register('timezone')}
              error={errors.timezone?.message}
            />
            <Select
              label={t('common.language')}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              {...register('language')}
              error={errors.language?.message}
            />
            <Select
              label={t('register.weekStartsOn')}
              options={WEEK_START_DAYS.map((d) => ({ value: d.value, label: d.label }))}
              {...register('weekStartDay')}
            />
            <Select
              label={t('register.dateFormat')}
              options={DATE_FORMATS.map((d) => ({ value: d.value, label: d.label }))}
              {...register('dateFormat')}
            />
            <Select
              label={t('register.timeFormat')}
              options={TIME_FORMATS.map((d) => ({ value: d.value, label: d.label }))}
              {...register('timeFormat')}
            />
          </div>
        </section>

        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('register.businessHours')}</h2>
            <p>{t('register.businessHoursHint')}</p>
          </div>
          <div className="wizard-hours">
            <label className="auth-checkbox">
              <input type="checkbox" {...register('skipHours')} />
              <span>{t('register.skipHours')}</span>
            </label>
            {values.skipHours ? (
              <p className="wizard-hours-hint">{t('register.skipHoursNote')}</p>
            ) : (
              <>
                <BusinessHoursEditor
                  value={values.businessHours}
                  onChange={(next) => setValue('businessHours', next, { shouldValidate: true, shouldDirty: true })}
                />
                {typeof errors.businessHours?.message === 'string' ? (
                  <span className="field-error">{errors.businessHours.message}</span>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="wizard-form-section">
          <div className="wizard-form-section-head">
            <h2>{t('common.products')}</h2>
            <p>{t('register.productsHint')}</p>
          </div>
          <div className="wizard-choice-block">
            <div className="wizard-product-stack">
              {PRODUCT_CATALOG.map((product) => {
                const productId = product.id as RegisterWizardFormValues['selectedProducts'][number];
                const selected = values.selectedProducts.includes(productId);
                const selectedPlan = values.planCodes[productId];
                const Icon = product.id === 'shopie' ? ShoppingBag : CalendarDays;
                return (
                  <article
                    key={product.id}
                    className={`wizard-product-card${selected ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="wizard-product-card-header"
                      onClick={() => toggleProduct(productId)}
                      aria-pressed={selected}
                    >
                      <span className="wizard-choice-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <div className="wizard-product-card-copy">
                        <strong className="wizard-choice-name">{product.name}</strong>
                        <p>{product.description}</p>
                      </div>
                      <span className={`wizard-choice-check${selected ? ' is-on' : ''}`} aria-hidden="true">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    </button>
                    {product.highlights?.length ? (
                      <ul className="wizard-choice-features">
                        {product.highlights.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="wizard-product-card-packages">
                      <p className="wizard-package-label">{t('register.choosePackage')}</p>
                      <div className="wizard-package-grid">
                        {plansForProduct(productId).map((plan) => {
                          const price = formatInr(plan.amount_paise);
                          const isSelected = selected && selectedPlan === plan.plan_code;
                          return (
                            <button
                              key={plan.plan_code}
                              type="button"
                              className={`wizard-package-option${isSelected ? ' is-selected' : ''}`}
                              onClick={() => {
                                const nextProducts = selected
                                  ? values.selectedProducts
                                  : [...values.selectedProducts, productId];
                                setValue('selectedProducts', nextProducts, { shouldValidate: true, shouldDirty: true });
                                setValue(
                                  'planCodes',
                                  { ...values.planCodes, [productId]: plan.plan_code },
                                  { shouldValidate: true, shouldDirty: true },
                                );
                              }}
                              aria-pressed={isSelected}
                            >
                              <div className="wizard-choice-card-top">
                                <span className="wizard-recommended">{isRecommendedPlanCode(plan.plan_code) ? t('register.recommended') : t('public.starter')}</span>
                                <span className={`wizard-choice-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
                                  <Check size={14} strokeWidth={3} />
                                </span>
                              </div>
                              <strong className="wizard-choice-name">{planTitle(plan)}</strong>
                              {price ? (
                                <p className="wizard-package-price">
                                  {price}
                                  <span>{t('register.perMonth')}</span>
                                </p>
                              ) : (
                                <p className="wizard-package-price">{t('register.trialFirst')}</p>
                              )}
                              <p>{plan.description}</p>
                              <div className="wizard-package-meta">
                                <span>{planSeatLine(plan)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {typeof errors.selectedProducts?.message === 'string' ? (
              <span className="field-error">{errors.selectedProducts.message}</span>
            ) : null}
            {typeof errors.planCodes?.message === 'string' ? (
              <span className="field-error">{errors.planCodes.message}</span>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  function renderBrandingStep() {
    return (
      <div className="wizard-form-grid">
        <ColorInput
          label={t('register.primaryColor')}
          value={values.primaryColor}
          onChange={(color) => setValue('primaryColor', color, { shouldValidate: true, shouldDirty: true })}
        />
        <ColorInput
          label={t('register.secondaryColor')}
          value={values.secondaryColor}
          onChange={(color) => setValue('secondaryColor', color, { shouldValidate: true, shouldDirty: true })}
        />
        <LogoUploadField
          value={brandingLogoFile}
          onChange={setBrandingLogoFile}
          accentColor={values.primaryColor}
        />
      </div>
    );
  }

  function renderReviewStep() {
    return (
      <div className="wizard-review">
        {provisionError ? <div role="alert" className="auth-error">{provisionError}</div> : null}
        <section>
          <div className="wizard-review-header">
            <h2>{t('common.business')}</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('business')}>{t('register.edit')}</Button>
          </div>
          <p>
            {values.businessName} · {values.businessCategory}
            {values.businessCategory === 'Other' && values.businessCategoryOther ? ` (${values.businessCategoryOther})` : ''}
            {' · '}
            {values.industry}
            {values.industry === 'Other' && values.industryOther ? ` (${values.industryOther})` : ''}
          </p>
          <p>{values.businessEmail} · {values.businessPhone}</p>
          <p>
            {[values.addressLine2, values.address, values.city, values.state, values.country, values.postalCode]
              .filter(Boolean)
              .join(', ')}
          </p>
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>{t('register.steps.owner')}</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('owner')}>{t('register.edit')}</Button>
          </div>
          <p>{values.firstName} {values.lastName} ({values.displayName})</p>
          <p>{values.email} · {values.mobile}</p>
          {values.googleIdToken ? <p>{t('register.continuingGoogle')}</p> : null}
          {affiliateCode ? <p>{t('register.affiliateLine', { code: affiliateCode })}</p> : null}
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>{t('register.steps.preferences')}</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('preferences')}>{t('register.edit')}</Button>
          </div>
          <p>{values.currency} · {values.timezone} · {values.language}</p>
          {values.selectedProducts.map((productId) => {
            const plan = plansForProduct(productId).find((item) => item.plan_code === values.planCodes[productId]);
            return (
              <p key={productId}>
                {getProductName(productId)} · {planTitle(plan ?? values.planCodes[productId] ?? t('register.packageFallback'))}
              </p>
            );
          })}
          <p>
            {t('register.hoursLine', {
              value: values.skipHours ? t('register.hoursSkipped') : summarizeWeeklyHours(values.businessHours),
            })}
          </p>
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>{t('register.steps.branding')}</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('branding')}>{t('register.edit')}</Button>
          </div>
          <p>{values.primaryColor} / {values.secondaryColor}</p>
          {brandingLogoFile && logoPreviewUrl ? (
            <div className="wizard-review-logo">
              <img src={logoPreviewUrl} alt={t('register.logoPreviewAlt', { name: brandingLogoFile.name })} />
              <span>{brandingLogoFile.name}</span>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  function renderProvisionStep() {
    return (
      <div className="wizard-provision" role="status" aria-live="polite">
        <div className="wizard-provision-spinner" aria-hidden="true" />
        <h2>{provisioning ? t('register.creatingAccountTitle') : t('register.readyToCreate')}</h2>
        <p>{t('register.provisionHint')}</p>
      </div>
    );
  }

  const stepContent: Record<RegisterWizardStepId, () => ReactNode> = {
    business: renderBusinessStep,
    owner: renderOwnerStep,
    preferences: renderPreferencesStep,
    branding: renderBrandingStep,
    review: renderReviewStep,
    provision: renderProvisionStep,
  };

  return (
    <WizardShell
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      currentStep={currentStep}
    >
      {stepContent[currentStep]()}
      {currentStep !== 'provision' ? (
        <div className="wizard-actions">
          <div className="wizard-actions-start">
            {stepIndex > 0 ? (
              <Button type="button" variant="neutral" onClick={goBack}>
                {t('common.back')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
            )}
            {currentStep !== 'review' ? (
              <Button type="button" variant="ghost" onClick={clearCurrentStep}>
                {t('register.clearStep')}
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="primary" onClick={goNext} disabled={provisioning}>
            {currentStep === 'review'
              ? provisioning
                ? t('register.creatingAccountBtn')
                : t('register.createAccount')
              : t('register.continue')}
          </Button>
        </div>
      ) : null}
    </WizardShell>
  );
}

export default RegisterWizard;
