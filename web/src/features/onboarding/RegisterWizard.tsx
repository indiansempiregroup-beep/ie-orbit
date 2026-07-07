import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { ColorInput } from '../../components/ColorInput';
import { LogoUploadField } from '../../components/LogoUploadField';
import { WizardShell } from './components/WizardShell';
import { PasswordStrengthIndicator } from '../auth/components/PasswordStrengthIndicator';
import { useOnboardingDraft } from './hooks/useOnboardingDraft';
import { provisionWorkspace } from './provisionWorkspace';
import {
  getDefaultRegisterValues,
  registerWizardSchema,
  stepFieldMap,
  type RegisterWizardFormValues,
} from './schemas/registerWizardSchema';
import {
  APPOINTMENT_INTERVALS,
  BUFFER_TIMES,
  BUSINESS_CATEGORIES,
  CURRENCIES,
  DATE_FORMATS,
  DEFAULT_DURATIONS,
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
import { getApiErrorMessage } from '../../lib/apiClient';
import { usePageMeta } from '../../hooks/usePageMeta';

export function RegisterWizard() {
  usePageMeta({
    title: 'Create workspace — AppointIE',
    description: 'Self-service business onboarding wizard for AppointIE.',
  });

  const navigate = useNavigate();
  const auth = useAuthContext();
  const { hydrated, loadDraft, saveDraft, clearDraft } = useOnboardingDraft();
  const [stepIndex, setStepIndex] = useState(0);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [brandingLogoFile, setBrandingLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);

  const currentStep = REGISTER_WIZARD_STEPS[stepIndex]?.id ?? 'business';

  const form = useForm<RegisterWizardFormValues>({
    resolver: zodResolver(registerWizardSchema),
    defaultValues: getDefaultRegisterValues(),
    mode: 'onBlur',
  });

  const { register, watch, setValue, trigger, formState: { errors } } = form;
  const values = watch();

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
      await provisionWorkspace({ values: parsed, login: auth.login, logoFile: brandingLogoFile });
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
        <Input label="Country" {...register('country')} />
        <Input label="State" {...register('state')} />
        <Input label="City" {...register('city')} />
        <Input label="Address" {...register('address')} />
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
            I accept the <Link to="/terms">Terms &amp; Conditions</Link>
          </span>
        </label>
        {errors.acceptTerms ? <span className="field-error">{errors.acceptTerms.message}</span> : null}
        <label className="auth-checkbox">
          <input type="checkbox" {...register('acceptPrivacy')} />
          <span>
            I accept the <Link to="/privacy">Privacy Policy</Link>
          </span>
        </label>
        {errors.acceptPrivacy ? <span className="field-error">{errors.acceptPrivacy.message}</span> : null}
      </div>
    );
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
        <Input label="Business hours start" type="time" {...register('businessHoursStart')} />
        <Input label="Business hours end" type="time" {...register('businessHoursEnd')} />
        <Select
          label="Appointment interval (minutes)"
          options={APPOINTMENT_INTERVALS.map((v) => ({ value: String(v), label: String(v) }))}
          value={String(values.appointmentInterval)}
          onChange={(e) => setValue('appointmentInterval', Number(e.target.value), { shouldValidate: true })}
        />
        <Select
          label="Default appointment duration"
          options={DEFAULT_DURATIONS.map((v) => ({ value: String(v), label: `${v} minutes` }))}
          value={String(values.defaultDuration)}
          onChange={(e) => setValue('defaultDuration', Number(e.target.value), { shouldValidate: true })}
        />
        <Select
          label="Buffer time"
          options={BUFFER_TIMES.map((v) => ({ value: String(v), label: `${v} minutes` }))}
          value={String(values.bufferTime)}
          onChange={(e) => setValue('bufferTime', Number(e.target.value), { shouldValidate: true })}
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
        <div className="wizard-product-picker">
          <span className="wizard-section-label">Product</span>
          {PRODUCT_CATALOG.map((product) => (
            <button
              key={product.id}
              type="button"
              className={`wizard-product-option${values.selectedProduct === product.id ? ' is-selected' : ''}`}
              onClick={() => setValue('selectedProduct', product.id, { shouldValidate: true })}
              aria-pressed={values.selectedProduct === product.id}
            >
              <strong>{product.name}</strong>
              <p>{product.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderBrandingStep() {
    return (
      <div className="wizard-form-grid">
        <label className="auth-checkbox">
          <input type="checkbox" {...register('skipBranding')} />
          <span>Skip branding for now</span>
        </label>
        {!values.skipBranding ? (
          <>
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
          </>
        ) : null}
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
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>Preferences</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('preferences')}>Edit</Button>
          </div>
          <p>{values.currency} · {values.timezone} · {values.language}</p>
          <p>Product: {getProductName(values.selectedProduct)}</p>
        </section>
        <section>
          <div className="wizard-review-header">
            <h2>Branding</h2>
            <Button type="button" variant="ghost" onClick={() => jumpToStep('branding')}>Edit</Button>
          </div>
          <p>{values.skipBranding ? 'Skipped' : `${values.primaryColor} / ${values.secondaryColor} (${values.theme})`}</p>
          {!values.skipBranding && brandingLogoFile && logoPreviewUrl ? (
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
      subtitle="Complete each step to provision your AppointIE business."
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
