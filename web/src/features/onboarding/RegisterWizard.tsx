import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { PRODUCT_CATALOG, getProductName, getRecommendedPlanCode, isRecommendedPlanCode, stripPlanProductPrefix } from '../../config/products';
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
      name: 'Orbit Appoint Pro',
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
      name: 'Orbit Mart Starter',
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
      name: 'Orbit Mart Pro',
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
  return stripPlanProductPrefix(name);
}

export function RegisterWizard() {
  usePageMeta({
    title: 'Create account — IE Orbit',
    description: 'Self-service business onboarding for Orbit Appoint and Orbit Mart.',
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

    if (googlePrefill?.freshStart) {
      clearDraft();
      form.reset(getDefaultRegisterValues());
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
      return;
    }

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
      ...(googlePrefill?.googleIdToken
        ? {
            googleIdToken: googlePrefill.googleIdToken,
            email: googlePrefill.email || draft.email,
            firstName: googlePrefill.firstName || draft.firstName,
            lastName: googlePrefill.lastName || draft.lastName,
          }
        : {}),
    });
  }, [
    hydrated,
    form,
    loadDraft,
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
        !(values.googleIdToken && (field === 'password' || field === 'confirmPassword')),
    ) as (keyof RegisterWizardFormValues)[];
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
      setProvisionError(getApiErrorMessage(err, 'Provisioning failed.'));
      setStepIndex(REGISTER_WIZARD_STEPS.findIndex((step) => step.id === 'review'));
    } finally {
      setProvisioning(false);
    }
  }

  function renderBusinessStep() {
    const addressLocked = values.latitude != null && values.longitude != null;
    const readOnlyFieldStyle = addressLocked ? { background: '#f9fafb' } : undefined;

    return (
      <div className="wizard-form-grid">
        <Input label="Business name" required {...register('businessName')} aria-invalid={Boolean(errors.businessName)} />
        {errors.businessName ? <span className="field-error">{errors.businessName.message}</span> : null}
        <Select
          label="Business category"
          required
          options={[{ value: '', label: 'Select category' }, ...BUSINESS_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          {...register('businessCategory')}
          error={errors.businessCategory?.message}
        />
        <Select
          label="Industry"
          required
          options={[{ value: '', label: 'Select industry' }, ...INDUSTRIES.map((c) => ({ value: c, label: c }))]}
          {...register('industry')}
          error={errors.industry?.message}
        />
        <Input label="Business email" required type="email" {...register('businessEmail')} />
        {errors.businessEmail ? <span className="field-error">{errors.businessEmail.message}</span> : null}
        <Input
          label="Business phone"
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          {...register('businessPhone')}
        />
        {errors.businessPhone ? <span className="field-error">{errors.businessPhone.message}</span> : null}
        <Input label="Website (optional)" {...register('website')} />
        {errors.website ? <span className="field-error">{errors.website.message}</span> : null}
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
          {errors.address ? <span className="field-error">{errors.address.message}</span> : null}
        </div>
        <Input label="Country" required readOnly={addressLocked} style={readOnlyFieldStyle} {...register('country')} />
        {errors.country ? <span className="field-error">{errors.country.message}</span> : null}
        <Input label="State" required readOnly={addressLocked} style={readOnlyFieldStyle} {...register('state')} />
        {errors.state ? <span className="field-error">{errors.state.message}</span> : null}
        <Input label="City" required {...register('city')} />
        {errors.city ? <span className="field-error">{errors.city.message}</span> : null}
        <Input label="Postal code" required {...register('postalCode')} />
        {errors.postalCode ? <span className="field-error">{errors.postalCode.message}</span> : null}
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="wizard-form-grid">
        <Input label="First name" required {...register('firstName')} autoComplete="given-name" />
        {errors.firstName ? <span className="field-error">{errors.firstName.message}</span> : null}
        <Input label="Last name" required {...register('lastName')} autoComplete="family-name" />
        {errors.lastName ? <span className="field-error">{errors.lastName.message}</span> : null}
        <Input label="Display name" required {...register('displayName')} />
        {errors.displayName ? <span className="field-error">{errors.displayName.message}</span> : null}
        <Input
          label="Email"
          required
          type="email"
          {...register('email')}
          autoComplete="email"
          readOnly={Boolean(values.googleIdToken)}
        />
        {errors.email ? <span className="field-error">{errors.email.message}</span> : null}
        <Input label="Mobile" required type="tel" inputMode="numeric" {...register('mobile')} autoComplete="tel" />
        {errors.mobile ? <span className="field-error">{errors.mobile.message}</span> : null}
        {values.googleIdToken ? (
          <p className="wizard-google-note">Continuing with Google. A password is not required.</p>
        ) : (
          <>
            <div className="wizard-password-field">
              <Input label="Password" required type="password" {...register('password')} autoComplete="new-password" />
              <PasswordStrengthIndicator password={values.password} />
              {errors.password ? <span className="field-error">{errors.password.message}</span> : null}
            </div>
            <Input label="Confirm password" required type="password" {...register('confirmPassword')} autoComplete="new-password" />
            {errors.confirmPassword ? <span className="field-error">{errors.confirmPassword.message}</span> : null}
            <div style={{ gridColumn: '1 / -1' }}>
              <GoogleSignInButton
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
                  }
                }}
              />
            </div>
          </>
        )}
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
            <p className="wizard-hours-hint">You can add weekly hours after your account is created.</p>
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
                              <span className="wizard-recommended">{isRecommendedPlanCode(plan.plan_code) ? 'Recommended' : 'Starter'}</span>
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
          {values.googleIdToken ? <p>Continuing with Google</p> : null}
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
          <p>{values.primaryColor} / {values.secondaryColor}</p>
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
        <h2>{provisioning ? 'Creating your account…' : 'Ready to create your account'}</h2>
        <p>Setting up tenant, business, owner roles, and default settings.</p>
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
      title="Create your account"
      subtitle="Complete each step to set up IE Orbit."
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
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" variant="primary" onClick={goNext} disabled={provisioning}>
            {currentStep === 'review' ? (provisioning ? 'Creating account…' : 'Create account') : 'Continue'}
          </Button>
        </div>
      ) : null}
    </WizardShell>
  );
}

export default RegisterWizard;
