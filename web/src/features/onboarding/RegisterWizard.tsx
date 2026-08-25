import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { WizardShell } from './components/WizardShell';
import { PasswordStrengthIndicator } from '../auth/components/PasswordStrengthIndicator';
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
import { PRODUCT_CATALOG, getProductName } from '../../config/products';
import { useAuthContext } from '../../contexts/AuthContext';
import { createAuthenticatedClient, getApiErrorMessage } from '../../lib/apiClient';
import { summarizeWeeklyHours } from '../../lib/businessHours';
import { usePageMeta } from '../../hooks/usePageMeta';

const FALLBACK_PACKAGES: Record<string, BillingPlanCatalogItem[]> = {
  appointie: [
    {
      product_code: 'appointie',
      plan_code: 'appointie-starter',
      name: 'AppointIE Starter',
      description: 'Scheduling and bookings for a single location.',
      billing_interval: 'monthly',
      trial_days: 15,
      is_default: true,
      max_staff: 1,
      max_branches: 1,
      currency: 'INR',
    },
    {
      product_code: 'appointie',
      plan_code: 'appointie-pro',
      name: 'AppointIE Pro',
      description: 'Multi-location scheduling with full business intelligence.',
      billing_interval: 'monthly',
      trial_days: 15,
      is_default: false,
      max_staff: 5,
      max_branches: 5,
      currency: 'INR',
    },
  ],
  shopie: [
    {
      product_code: 'shopie',
      plan_code: 'shopie-starter',
      name: 'ShopIE Starter',
      description: 'Catalog, POS, inventory, and billing for a single location.',
      billing_interval: 'monthly',
      trial_days: 15,
      is_default: true,
      max_staff: 2,
      max_branches: 1,
      currency: 'INR',
    },
    {
      product_code: 'shopie',
      plan_code: 'shopie-pro',
      name: 'ShopIE Pro',
      description: 'Multi-location commerce with advanced inventory and billing.',
      billing_interval: 'monthly',
      trial_days: 15,
      is_default: false,
      max_staff: 5,
      max_branches: 5,
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
  return name.replace(/^(AppointIE|ShopIE)\s+/i, '') || name;
}

export function RegisterWizard() {
  usePageMeta({
    title: 'Create workspace — IE Orbit',
    description: 'Self-service business onboarding wizard for AppointIE and ShopIE.',
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuthContext();
  const { hydrated, loadDraft, saveDraft, clearDraft } = useOnboardingDraft();
  const [stepIndex, setStepIndex] = useState(0);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [brandingLogoFile, setBrandingLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [affiliateCode, setAffiliateCode] = useState(() => captureAffiliateCodeFromLocation());
  const draftLoadedRef = useRef(false);

  const currentStep = REGISTER_WIZARD_STEPS[stepIndex]?.id ?? 'business';

  const form = useForm<RegisterWizardFormValues>({
    resolver: zodResolver(registerWizardSchema),
    defaultValues: getDefaultRegisterValues(),
    mode: 'onBlur',
  });

  const { register, watch, setValue, trigger, formState: { errors } } = form;
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
    const draft = loadDraft();
    const detectedTz = detectDefaultTimezone();
    const timezone = TIMEZONES.includes(detectedTz as (typeof TIMEZONES)[number])
      ? detectedTz
      : draft.timezone && TIMEZONES.includes(draft.timezone as (typeof TIMEZONES)[number])
        ? draft.timezone
        : 'UTC';
    form.reset({
      ...draft,
      currency: draft.currency || detectDefaultCurrency(),
      timezone: timezone as RegisterWizardFormValues['timezone'],
    });
  }, [hydrated, form, loadDraft]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => saveDraft(values), 400);
    return () => window.clearTimeout(timer);
  }, [values, hydrated, saveDraft]);

  useEffect(() => {
    const next = { ...values.planCodes };
    let changed = false;
    for (const productId of values.selectedProducts) {
      const plans = plansForProduct(productId);
      if (!plans.length) continue;
      if (plans.some((plan) => plan.plan_code === next[productId])) continue;
      const fallback = plans.find((plan) => plan.is_default) ?? plans[0];
      if (fallback) {
        next[productId] = fallback.plan_code;
        changed = true;
      }
    }
    if (changed) setValue('planCodes', next, { shouldValidate: true });
  }, [catalogPlans, values.selectedProducts, values.planCodes, setValue]);

  async function goNext() {
    const fields = [...(stepFieldMap[currentStep as keyof typeof stepFieldMap] ?? [])] as (keyof RegisterWizardFormValues)[];
    const valid = fields.length === 0 ? true : await trigger(fields);
    if (!valid) return;
    if (currentStep === 'review') {
      await handleProvision();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, REGISTER_WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  function jumpToStep(stepId: RegisterWizardStepId) {
    const index = REGISTER_WIZARD_STEPS.findIndex((step) => step.id === stepId);
    if (index >= 0) setStepIndex(index);
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
      navigate('/onboarding/success');
    } catch (err) {
      setProvisionError(getApiErrorMessage(err, 'Provisioning failed.'));
      setStepIndex(REGISTER_WIZARD_STEPS.findIndex((step) => step.id === 'review'));
    } finally {
      setProvisioning(false);
    }
  }

  function renderBusinessStep() {
    return (
      <div className="wizard-form-grid">
        <Input label="Business name" {...register('businessName')} aria-invalid={Boolean(errors.businessName)} />
        {errors.businessName ? <span className="field-error">{errors.businessName.message}</span> : null}
        <Select
          label="Business category"
          options={[{ value: '', label: 'Select category' }, ...BUSINESS_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          {...register('businessCategory')}
          error={errors.businessCategory?.message}
        />
        <Select
          label="Industry"
          options={[{ value: '', label: 'Select industry' }, ...INDUSTRIES.map((c) => ({ value: c, label: c }))]}
          {...register('industry')}
          error={errors.industry?.message}
        />
        <Input label="Business email" type="email" {...register('businessEmail')} />
        {errors.businessEmail ? <span className="field-error">{errors.businessEmail.message}</span> : null}
        <Input label="Business phone" {...register('businessPhone')} />
        <Input label="Website (optional)" {...register('website')} />
        <div style={{ gridColumn: '1 / -1' }}>
          <AddressLocationPicker
            label="Business address"
            value={values.address}
            latitude={values.latitude}
            longitude={values.longitude}
            onChangeText={(value) => setValue('address', value, { shouldDirty: true, shouldValidate: true })}
            onPlaceSelected={(place) => {
              setValue('address', place.line1 || place.formattedAddress, { shouldDirty: true });
              setValue('city', place.city || '', { shouldDirty: true });
              setValue('state', place.state || '', { shouldDirty: true });
              setValue('country', place.country || '', { shouldDirty: true });
              setValue('postalCode', place.postalCode || '', { shouldDirty: true });
              setValue('latitude', place.latitude ?? null, { shouldDirty: true });
              setValue('longitude', place.longitude ?? null, { shouldDirty: true });
            }}
          />
        </div>
        <Input label="Country" {...register('country')} />
        <Input label="State" {...register('state')} />
        <Input label="City" {...register('city')} />
        <Input label="Postal code" {...register('postalCode')} />
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="wizard-form-grid">
        <Input label="First name" {...register('firstName')} autoComplete="given-name" />
        <Input label="Last name" {...register('lastName')} autoComplete="family-name" />
        <Input label="Display name" {...register('displayName')} />
        <Input label="Email" type="email" {...register('email')} autoComplete="email" />
        <Input label="Mobile" {...register('mobile')} autoComplete="tel" />
        <div className="wizard-password-field">
          <Input label="Password" type="password" {...register('password')} autoComplete="new-password" />
          <PasswordStrengthIndicator password={values.password} />
          {errors.password ? <span className="field-error">{errors.password.message}</span> : null}
        </div>
        <Input label="Confirm password" type="password" {...register('confirmPassword')} autoComplete="new-password" />
        {errors.confirmPassword ? <span className="field-error">{errors.confirmPassword.message}</span> : null}
        <label className="auth-checkbox">
          <input type="checkbox" {...register('acceptTerms')} />
          <span>
            I accept the <Link to="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</Link>
          </span>
        </label>
        {errors.acceptTerms ? <span className="field-error">{errors.acceptTerms.message}</span> : null}
        <label className="auth-checkbox">
          <input type="checkbox" {...register('acceptPrivacy')} />
          <span>
            I accept the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>
          </span>
        </label>
        {errors.acceptPrivacy ? <span className="field-error">{errors.acceptPrivacy.message}</span> : null}
        <Input
          label="Affiliate code (optional)"
          value={affiliateCode}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setAffiliateCode(next);
            persistAffiliateCode(next);
          }}
          autoComplete="off"
        />
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
      <div className="wizard-form-grid">
        <Select
          label="Currency"
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
          {...register('currency')}
          error={errors.currency?.message}
        />
        <Select
          label="Timezone"
          options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
          {...register('timezone')}
          error={errors.timezone?.message}
        />
        <Select
          label="Language"
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          {...register('language')}
          error={errors.language?.message}
        />
        <Select
          label="Week starts on"
          options={WEEK_START_DAYS.map((d) => ({ value: d.value, label: d.label }))}
          {...register('weekStartDay')}
        />
        <Select
          label="Date format"
          options={DATE_FORMATS.map((d) => ({ value: d.value, label: d.label }))}
          {...register('dateFormat')}
        />
        <Select
          label="Time format"
          options={TIME_FORMATS.map((d) => ({ value: d.value, label: d.label }))}
          {...register('timeFormat')}
        />
        <div className="wizard-hours">
          <span className="wizard-section-label">Business hours</span>
          <p className="wizard-hours-hint">
            Set hours for each day now, or skip and complete this later in Settings.
          </p>
          <label className="auth-checkbox">
            <input type="checkbox" {...register('skipHours')} />
            <span>Skip business hours for now</span>
          </label>
          {values.skipHours ? (
            <p className="wizard-hours-hint">You can add weekly hours after your workspace is created.</p>
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
        <div className="wizard-choice-block">
          <div className="wizard-choice-header">
            <span className="wizard-section-label">Products</span>
            <p className="wizard-section-hint">
              Select one or both. Packages for that product stay in the same card.
            </p>
          </div>
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
                    <p className="wizard-package-label">Choose a package</p>
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
                              <span className="wizard-recommended">{plan.is_default ? 'Recommended' : 'Upgrade'}</span>
                              <span className={`wizard-choice-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
                                <Check size={14} strokeWidth={3} />
                              </span>
                            </div>
                            <strong className="wizard-choice-name">{planTitle(plan)}</strong>
                            {price ? (
                              <p className="wizard-package-price">
                                {price}
                                <span>/month</span>
                              </p>
                            ) : (
                              <p className="wizard-package-price">Trial first</p>
                            )}
                            <p>{plan.description}</p>
                            <div className="wizard-package-meta">
                              <span>{plan.max_staff ?? 1} staff</span>
                              <span>
                                {plan.max_branches ?? 1} office{(plan.max_branches ?? 1) === 1 ? '' : 's'}
                              </span>
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
      </div>
    );
  }

  function renderBrandingStep() {
    return (
      <div className="wizard-form-grid">
        <ColorInput
          label="Primary color"
          value={values.primaryColor}
          onChange={(color) => setValue('primaryColor', color, { shouldValidate: true, shouldDirty: true })}
        />
        <ColorInput
          label="Secondary color"
          value={values.secondaryColor}
          onChange={(color) => setValue('secondaryColor', color, { shouldValidate: true, shouldDirty: true })}
        />
        <Select
          label="Theme"
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          {...register('theme')}
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
            <h2>Business</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('business')}>Edit</Button>
          </div>
          <p>{values.businessName} · {values.businessCategory} · {values.industry}</p>
          <p>{values.businessEmail} · {values.businessPhone}</p>
          <p>{values.address}, {values.city}, {values.state}, {values.country} {values.postalCode}</p>
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>Owner</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('owner')}>Edit</Button>
          </div>
          <p>{values.firstName} {values.lastName} ({values.displayName})</p>
          <p>{values.email} · {values.mobile}</p>
          {affiliateCode ? <p>Affiliate code: {affiliateCode}</p> : null}
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>Preferences</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('preferences')}>Edit</Button>
          </div>
          <p>{values.currency} · {values.timezone} · {values.language}</p>
          {values.selectedProducts.map((productId) => {
            const plan = plansForProduct(productId).find((item) => item.plan_code === values.planCodes[productId]);
            return (
              <p key={productId}>
                {getProductName(productId)} · {planTitle(plan ?? values.planCodes[productId] ?? 'Package')}
              </p>
            );
          })}
          <p>Hours: {values.skipHours ? 'Skipped for now' : summarizeWeeklyHours(values.businessHours)}</p>
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>Branding</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('branding')}>Edit</Button>
          </div>
          <p>{values.primaryColor} / {values.secondaryColor} ({values.theme})</p>
          {brandingLogoFile && logoPreviewUrl ? (
            <div className="wizard-review-logo">
              <img src={logoPreviewUrl} alt={`${brandingLogoFile.name} preview`} />
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
        <h2>{provisioning ? 'Provisioning your workspace…' : 'Ready to provision'}</h2>
        <p>Creating tenant, business, owner roles, and default settings.</p>
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
      title="Create your workspace"
      subtitle="Complete each step to provision your IE Orbit workspace."
      currentStep={currentStep}
    >
      {stepContent[currentStep]()}
      {currentStep !== 'provision' ? (
        <div className="wizard-actions">
          {stepIndex > 0 ? (
            <Button type="button" variant="neutral" onClick={goBack}>
              Back
            </Button>
          ) : (
            <Link to="/auth/register">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          )}
          <Button type="button" variant="primary" onClick={goNext} disabled={provisioning}>
            {currentStep === 'review' ? (provisioning ? 'Provisioning…' : 'Create workspace') : 'Continue'}
          </Button>
        </div>
      ) : null}
    </WizardShell>
  );
}

export default RegisterWizard;
