import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { ColorInput } from '../../components/ColorInput';
import { LogoUploadField } from '../../components/LogoUploadField';
import { BusinessHoursEditor } from '../../components/BusinessHoursEditor';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { PRODUCT_CATALOG } from '../../config/products';
import {
  APPOINTMENT_INTERVALS,
  BUFFER_TIMES,
  BUSINESS_CATEGORIES,
  DATE_FORMATS,
  DEFAULT_DURATIONS,
  INDUSTRIES,
  TIME_FORMATS,
  WEEK_START_DAYS,
  currencySelectOptions,
  ensureSelectOption,
  languageSelectOptions,
  timezoneSelectOptions,
} from '../../config/onboarding';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { useBusinessLogo } from '../../hooks/useBusinessLogo';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { uploadBrandingLogo } from '../onboarding/uploadBrandingLogo';
import {
  businessToFormState,
  createEmptyBusinessProfileFormState,
  formStateToBusinessUpdate,
  formStatesEqual,
  type BusinessProfileFormState,
} from './businessProfileModel';
import {
  useBusinessProfileQuery,
  useBusinessProfileUpdate,
  useTenantBrandingQuery,
} from './businessSettingsHooks';

const fieldGridStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset style={{ display: 'grid', gap: 16, border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#f8fafc', margin: 0 }}>
      <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 6px' }}>{title}</legend>
      {children}
    </fieldset>
  );
}

export function BusinessProfileEditPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const businessQuery = useBusinessProfileQuery();
  const tenantBrandingQuery = useTenantBrandingQuery();
  const updateBusiness = useBusinessProfileUpdate();

  const [formState, setFormState] = useState<BusinessProfileFormState>(createEmptyBusinessProfileFormState);
  const [initialFormState, setInitialFormState] = useState<BusinessProfileFormState>(createEmptyBusinessProfileFormState);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentLogoUrl = useBusinessLogo(businessQuery.data?.logo);

  useEffect(() => {
    if (!businessQuery.data) return;
    const nextState = businessToFormState(businessQuery.data, tenantBrandingQuery.data);
    setFormState(nextState);
    setInitialFormState(nextState);
  }, [businessQuery.data, tenantBrandingQuery.data]);

  const isDirty = !formStatesEqual(formState, initialFormState) || Boolean(logoFile);

  const currencyOptions = useMemo(
    () => ensureSelectOption(currencySelectOptions, formState.currency),
    [formState.currency],
  );
  const categoryOptions = useMemo(
    () => ensureSelectOption(
      [{ value: '', label: 'Select category' }, ...BUSINESS_CATEGORIES.map((c) => ({ value: c, label: c }))],
      formState.business_type,
    ),
    [formState.business_type],
  );
  const industryOptions = useMemo(
    () => ensureSelectOption(
      [{ value: '', label: 'Select industry' }, ...INDUSTRIES.map((c) => ({ value: c, label: c }))],
      formState.industry_category,
    ),
    [formState.industry_category],
  );
  const timezoneOptions = useMemo(
    () => ensureSelectOption(timezoneSelectOptions, formState.timezone),
    [formState.timezone],
  );
  const languageOptions = useMemo(
    () => ensureSelectOption(languageSelectOptions, formState.language),
    [formState.language],
  );

  function updateField<K extends keyof BusinessProfileFormState>(key: K, value: BusinessProfileFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace.businessId || !auth.token) return;

    setSaving(true);
    setErrorMessage(null);

    try {
      if (logoFile) {
        const storedLogoUrl = await uploadBrandingLogo({
          accessToken: auth.token,
          tenantId: workspace.tenantId!,
          businessId: workspace.businessId,
          logoFile,
          displayName: formState.display_name || formState.business_name,
        });
        updateField('logo', storedLogoUrl);
      }

      const payload = formStateToBusinessUpdate(formState, businessQuery.data?.settings);
      await updateBusiness.mutateAsync(payload);

      if (workspace.tenantId) {
        const client = createAuthenticatedClient(auth.token, workspace.tenantId, workspace.businessId);
        await client.tenants.patch(workspace.tenantId, {
          primary_color: formState.primary_color,
          secondary_color: formState.secondary_color,
        });
        await client.tenants.settings({
          branding: {
            primary_color: formState.primary_color,
            secondary_color: formState.secondary_color,
            theme_mode: formState.theme_mode,
          },
        });
      }

      await workspace.refreshWorkspace();
      snackbar.push('Business profile updated successfully.', 'success');
      navigate('/settings/business');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save business profile.';
      setErrorMessage(message);
      snackbar.push(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!workspace.businessId) {
    return (
      <Card style={{ padding: 24 }}>
        <p style={{ color: '#6b7280' }}>Select or create a business before editing its profile.</p>
        <Button variant="ghost" onClick={() => navigate('/settings/business')}>Back to business profile</Button>
      </Card>
    );
  }

  if (businessQuery.isLoading) {
    return <Card style={{ padding: 24 }}><p>Loading business profile…</p></Card>;
  }

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'grid', gap: 20 }}>
        <div>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
            Business profile
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>Edit business profile</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            Update the same business details you provided while creating your workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
          <Section title="Business details">
            <div style={fieldGridStyle}>
              <Input label="Business name" value={formState.business_name} onChange={(e) => updateField('business_name', e.target.value)} required disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="Display name" value={formState.display_name} onChange={(e) => updateField('display_name', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Business category" options={categoryOptions} value={formState.business_type} onChange={(e) => updateField('business_type', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Industry" options={industryOptions} value={formState.industry_category} onChange={(e) => updateField('industry_category', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="Business email" type="email" value={formState.email} onChange={(e) => updateField('email', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="Business phone" value={formState.primary_contact} onChange={(e) => updateField('primary_contact', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="Website (optional)" value={formState.website} onChange={(e) => updateField('website', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
            </div>
          </Section>

          <Section title="Location">
            <AddressLocationPicker
              label="Business address"
              value={formState.address_line1}
              latitude={formState.latitude}
              longitude={formState.longitude}
              onChangeText={(value) => updateField('address_line1', value)}
              onPlaceSelected={(place) => {
                setFormState((current) => ({
                  ...current,
                  address_line1: place.line1 || place.formattedAddress,
                  city: place.city || '',
                  state: place.state || '',
                  country: place.country || '',
                  postal_code: place.postalCode || '',
                  latitude: place.latitude ?? null,
                  longitude: place.longitude ?? null,
                }));
              }}
            />
            <div style={fieldGridStyle}>
              <Input label="Country" value={formState.country} onChange={(e) => updateField('country', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="State" value={formState.state} onChange={(e) => updateField('state', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="City" value={formState.city} onChange={(e) => updateField('city', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Input label="Postal code" value={formState.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
            </div>
          </Section>

          <Section title="Regional preferences">
            <div style={fieldGridStyle}>
              <Select label="Currency" options={currencyOptions} value={formState.currency} onChange={(e) => updateField('currency', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Timezone" options={timezoneOptions} value={formState.timezone} onChange={(e) => updateField('timezone', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Language" options={languageOptions} value={formState.language} onChange={(e) => updateField('language', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Date format" options={DATE_FORMATS.map((d) => ({ value: d.value, label: d.label }))} value={formState.date_format} onChange={(e) => updateField('date_format', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
              <Select label="Time format" options={TIME_FORMATS.map((d) => ({ value: d.value, label: d.label }))} value={formState.time_format} onChange={(e) => updateField('time_format', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
            </div>
          </Section>

          <Section title="Operations">
            <div style={fieldGridStyle}>
              <Select label="Week starts on" options={WEEK_START_DAYS.map((d) => ({ value: d.value, label: d.label }))} value={formState.week_start_day} onChange={(e) => updateField('week_start_day', e.target.value)} disabled={saving} style={{ marginBottom: 0 }} />
            </div>
            <BusinessHoursEditor
              value={formState.business_hours}
              onChange={(next) => updateField('business_hours', next)}
              disabled={saving}
            />
            {formState.selected_product === 'appointie' ? (
              <>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                  Orbit Appoint booking defaults. Set these after you pick a package; they are not used by Orbit Mart.
                </p>
                <div style={fieldGridStyle}>
                  <Select label="Appointment interval (minutes)" options={APPOINTMENT_INTERVALS.map((v) => ({ value: String(v), label: String(v) }))} value={String(formState.appointment_interval)} onChange={(e) => updateField('appointment_interval', Number(e.target.value))} disabled={saving} style={{ marginBottom: 0 }} />
                  <Select label="Default appointment duration" options={DEFAULT_DURATIONS.map((v) => ({ value: String(v), label: `${v} minutes` }))} value={String(formState.default_duration)} onChange={(e) => updateField('default_duration', Number(e.target.value))} disabled={saving} style={{ marginBottom: 0 }} />
                  <Select label="Buffer time" options={BUFFER_TIMES.map((v) => ({ value: String(v), label: `${v} minutes` }))} value={String(formState.buffer_time)} onChange={(e) => updateField('buffer_time', Number(e.target.value))} disabled={saving} style={{ marginBottom: 0 }} />
                </div>
              </>
            ) : null}
          </Section>

          <Section title="Product">
            <div className="wizard-product-picker" style={{ display: 'grid', gap: 12 }}>
              {PRODUCT_CATALOG.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={`wizard-product-option${formState.selected_product === product.id ? ' is-selected' : ''}`}
                  onClick={() => updateField('selected_product', product.id)}
                  aria-pressed={formState.selected_product === product.id}
                  disabled={saving}
                  style={{ textAlign: 'left' }}
                >
                  <strong>{product.name}</strong>
                  <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{product.description}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Branding">
            <div style={fieldGridStyle}>
              <ColorInput label="Primary color" value={formState.primary_color} onChange={(value) => updateField('primary_color', value)} />
              <ColorInput label="Secondary color" value={formState.secondary_color} onChange={(value) => updateField('secondary_color', value)} />
              <Select
                label="Theme"
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                value={formState.theme_mode}
                onChange={(e) => updateField('theme_mode', e.target.value)}
                disabled={saving}
                style={{ marginBottom: 0 }}
              />
            </div>
            <LogoUploadField
              value={logoFile}
              onChange={setLogoFile}
              currentLogoUrl={currentLogoUrl}
              accentColor={formState.primary_color}
            />
            <Input
              label="Shop UPI ID"
              value={formState.upi_vpa}
              onChange={(e) => updateField('upi_vpa', e.target.value)}
              placeholder="shop@okaxis"
              disabled={saving}
            />
            <p style={{ margin: 0, color: 'var(--color-muted-foreground, #6b7280)', fontSize: 13 }}>
              Used to generate amount-specific QR codes for customer online orders. Optional static QR URL can be set via API as payment_qr_url.
            </p>
          </Section>

          {errorMessage ? (
            <div style={{ color: '#dc2626', padding: 12, borderRadius: 12, background: '#fef2f2' }}>{errorMessage}</div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" type="button" onClick={() => navigate('/settings/business')} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!isDirty || saving || updateBusiness.isPending}>
              {saving ? 'Saving…' : 'Save business profile'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
