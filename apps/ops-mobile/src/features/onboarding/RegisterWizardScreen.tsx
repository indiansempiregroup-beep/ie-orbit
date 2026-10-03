import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { FormAlert } from '../../components/ui/FormAlert';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { TimeField } from '../../components/TimeField';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SelectField } from '../../components/SelectField';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { layout } from '../../theme/layout';
import {
  BUSINESS_CATEGORIES,
  CURRENCIES,
  DATE_FORMATS,
  detectDefaultCurrency,
  detectDefaultTimezone,
  INDUSTRIES,
  LANGUAGES,
  TIME_FORMATS,
  TIMEZONES,
  WEEK_START_DAYS,
} from '../../constants/options';
import { getApiErrorMessage } from '../../utils/format';
import { emailFieldError } from '../../utils/emailValidation';
import { indianMobileError, requiredMessage } from '../../utils/formValidation';
import { decodeGoogleIdToken, isGoogleAccountNotRegistered } from '../../utils/googleAuth';
import { defaultPublicSiteUrl } from '../../utils/impersonationHandoff';
import {
  PRODUCT_CATALOG,
  formatInrFromPaise,
  formatPlanDisplayName,
  getProductName,
  getRecommendedPlanCode,
  isRecommendedPlanCode,
  planSeatLine,
} from '../../utils/products';
import { opsClient } from '../../api/client';
import {
  defaultWeeklyHours,
  HOUR_DAYS,
  provisionWorkspace,
  summarizeWeeklyHours,
  type RegisterWizardValues,
  type WeeklyHours,
} from '../../utils/provisionWorkspace';
import type { AuthStackParamList } from '../../navigation/types';

const STEPS = ['Business', 'Owner', 'Preferences', 'Branding', 'Review'] as const;

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

function websiteError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname.includes('.')) {
      return 'Enter a valid website URL (for example, https://yoursalon.com)';
    }
    return undefined;
  } catch {
    return 'Enter a valid website URL (for example, https://yoursalon.com)';
  }
}

function defaultValues(): RegisterWizardValues {
  return {
    businessName: '',
    businessCategory: '',
    businessCategoryOther: '',
    industry: '',
    industryOther: '',
    businessEmail: '',
    businessPhone: '',
    website: '',
    city: '',
    country: '',
    state: '',
    address: '',
    addressLine2: '',
    postalCode: '',
    latitude: null,
    longitude: null,
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    mobile: '',
    ownerOtpCode: '',
    acceptTerms: false,
    acceptPrivacy: false,
    timezone: detectDefaultTimezone(),
    currency: detectDefaultCurrency(),
    language: 'en',
    weekStartDay: 'monday',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    selectedProducts: ['appointie'],
    planCodes: { appointie: 'appointie-pro' },
    skipHours: false,
    businessHours: defaultWeeklyHours(),
    primaryColor: '#1A56DB',
    secondaryColor: '#111827',
    logoAsset: null,
    affiliateCode: '',
    googleIdToken: '',
  };
}

function initialValues(params?: AuthStackParamList['RegisterWizard']): RegisterWizardValues {
  const values = defaultValues();
  if (!params?.googleIdToken) return values;
  const displayName = [params.firstName, params.lastName].filter(Boolean).join(' ');
  return {
    ...values,
    googleIdToken: params.googleIdToken,
    email: params.email || '',
    firstName: params.firstName || '',
    lastName: params.lastName || '',
    displayName,
    businessEmail: params.email || '',
  };
}

function openLegalPage(path: '/terms' | '/privacy') {
  const base = defaultPublicSiteUrl().replace(/\/$/, '');
  void Linking.openURL(`${base}${path}`);
}

type Props = NativeStackScreenProps<AuthStackParamList, 'RegisterWizard'>;

export function RegisterWizardScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { bootstrapSession, loginWithGoogle } = useAuth();
  const { initializeWorkspace } = useWorkspace();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterWizardValues>(() => initialValues(route.params));
  const [ownerOtpSent, setOwnerOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalogPlans, setCatalogPlans] = useState<BillingPlanCatalogItem[]>([]);

  function plansForProduct(productId: string) {
    const fromCatalog = catalogPlans.filter((plan) => plan.product_code === productId);
    return fromCatalog.length > 0 ? fromCatalog : FALLBACK_PACKAGES[productId] ?? [];
  }

  useEffect(() => {
    let cancelled = false;
    opsClient.billing
      .publicPlans()
      .then((response) => {
        if (!cancelled) setCatalogPlans(response.data.plans ?? []);
      })
      .catch(() => {
        if (!cancelled) setCatalogPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (changed) patch({ planCodes: next });
  }, [catalogPlans, values.selectedProducts, values.planCodes]);

  function patch(partial: Partial<RegisterWizardValues>) {
    setValues((current) => ({ ...current, ...partial }));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(partial)) delete next[key];
      return next;
    });
  }

  function updateHours(day: keyof WeeklyHours, patchHours: Partial<WeeklyHours[keyof WeeklyHours]>) {
    setValues((current) => ({
      ...current,
      businessHours: {
        ...current.businessHours,
        [day]: { ...current.businessHours[day], ...patchHours },
      },
    }));
  }

  function validateStep(): Record<string, string> {
    const next: Record<string, string> = {};
    if (step === 0) {
      if (!values.businessName.trim() || values.businessName.trim().length < 2) {
        next.businessName = 'Business name is required';
      }
      if (!values.businessCategory.trim()) next.businessCategory = 'Select a category';
      if (values.businessCategory === 'Other' && !values.businessCategoryOther.trim()) {
        next.businessCategoryOther = 'Describe your business category';
      }
      if (!values.industry.trim()) next.industry = 'Select an industry';
      if (values.industry === 'Other' && !values.industryOther.trim()) {
        next.industryOther = 'Describe your industry';
      }
      const businessEmailError = emailFieldError(values.businessEmail);
      if (businessEmailError) next.businessEmail = businessEmailError;
      const phoneError = indianMobileError(values.businessPhone, true);
      if (phoneError) next.businessPhone = phoneError;
      const siteError = websiteError(values.website);
      if (siteError) next.website = siteError;
      if (!values.address.trim()) next.address = requiredMessage('Address');
      if (!values.addressLine2.trim()) {
        next.addressLine2 = requiredMessage('Flat, floor, building or landmark');
      }
      if (!values.city.trim()) next.city = requiredMessage('City');
      if (!values.state.trim()) next.state = requiredMessage('State');
      if (!values.country.trim()) next.country = requiredMessage('Country');
      if (!values.postalCode.trim()) next.postalCode = requiredMessage('Postal code');
      if (values.latitude == null || values.longitude == null) {
        next.address = next.address || 'Select a map location for this address.';
      }
    }
    if (step === 1) {
      if (!values.firstName.trim()) next.firstName = requiredMessage('First name');
      if (!values.lastName.trim()) next.lastName = requiredMessage('Last name');
      if (!values.displayName.trim()) next.displayName = requiredMessage('Display name');
      const emailError = emailFieldError(values.email);
      if (emailError) next.email = emailError;
      const mobileError = indianMobileError(values.mobile, true);
      if (mobileError) next.mobile = mobileError;
      if (!values.googleIdToken && !/^\d{6}$/.test(values.ownerOtpCode.trim())) {
        next.ownerOtpCode = 'Enter the 6-digit code from your email';
      }
      if (!values.acceptTerms) next.acceptTerms = 'Accept the terms to continue';
      if (!values.acceptPrivacy) next.acceptPrivacy = 'Accept the privacy policy to continue';
    }
    if (step === 2) {
      if (!values.selectedProducts.length) next.products = 'Select at least one product.';
      const missingPlan = values.selectedProducts.find((productId) => !values.planCodes[productId]);
      if (missingPlan) next.products = `Select a ${getProductName(missingPlan)} package.`;
      if (!values.skipHours) {
        const openDays = HOUR_DAYS.filter((day) => values.businessHours[day.value].open);
        if (!openDays.length) next.hours = 'Open at least one day, or skip hours for now.';
        const invalid = openDays.some(
          (day) => values.businessHours[day.value].start >= values.businessHours[day.value].end,
        );
        if (invalid) next.hours = 'Closing time must be after opening time.';
      }
    }
    return next;
  }

  function clearCurrentStep() {
    const defaults = defaultValues();
    if (step === 0) {
      patch({
        businessName: '',
        businessCategory: '',
        businessCategoryOther: '',
        industry: '',
        industryOther: '',
        businessEmail: '',
        businessPhone: '',
        website: '',
        address: '',
        addressLine2: '',
        city: '',
        state: '',
        country: '',
        postalCode: '',
        latitude: null,
        longitude: null,
      });
    } else if (step === 1) {
      patch({
        firstName: '',
        lastName: '',
        displayName: '',
        email: values.googleIdToken ? values.email : '',
        mobile: '',
        ownerOtpCode: '',
        acceptTerms: false,
        acceptPrivacy: false,
        affiliateCode: '',
      });
      setOwnerOtpSent(false);
    } else if (step === 2) {
      patch({
        timezone: defaults.timezone,
        currency: defaults.currency,
        language: defaults.language,
        weekStartDay: defaults.weekStartDay,
        dateFormat: defaults.dateFormat,
        timeFormat: defaults.timeFormat,
        selectedProducts: defaults.selectedProducts,
        planCodes: defaults.planCodes,
        skipHours: defaults.skipHours,
        businessHours: defaultWeeklyHours(),
      });
    } else if (step === 3) {
      patch({
        primaryColor: defaults.primaryColor,
        secondaryColor: defaults.secondaryColor,
        logoAsset: null,
      });
    }
    setError(null);
    setFieldErrors({});
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = await provisionWorkspace(values);
      await bootstrapSession(payload);
      await initializeWorkspace(payload.tenant.id, payload.business.id);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "We couldn't create your account with those details. Please review and try again.",
          'register',
        ),
      );
      setSubmitting(false);
    }
  }

  const categoryLabel =
    values.businessCategory === 'Other' && values.businessCategoryOther.trim()
      ? `Other (${values.businessCategoryOther.trim()})`
      : values.businessCategory;
  const industryLabel =
    values.industry === 'Other' && values.industryOther.trim()
      ? `Other (${values.industryOther.trim()})`
      : values.industry;

  const stepFields = (
    <>
      {step === 0 ? (
        <>
          <Text style={styles.sectionLabel}>Business profile</Text>
          <Text style={styles.hint}>Tell customers who you are. You can edit this later in Settings.</Text>
          <Input
            label="Business name"
            required
            value={values.businessName}
            onChangeText={(v) => patch({ businessName: v })}
            error={fieldErrors.businessName}
          />
          <SelectField
            label="Business category"
            required
            value={values.businessCategory}
            options={[
              { value: '', label: 'Select category' },
              ...BUSINESS_CATEGORIES.map((item) => ({ value: item, label: item })),
            ]}
            onChange={(v) => patch({ businessCategory: v, businessCategoryOther: v === 'Other' ? values.businessCategoryOther : '' })}
            error={fieldErrors.businessCategory}
          />
          {values.businessCategory === 'Other' ? (
            <Input
              label="Describe your category"
              required
              value={values.businessCategoryOther}
              onChangeText={(v) => patch({ businessCategoryOther: v })}
              error={fieldErrors.businessCategoryOther}
            />
          ) : null}
          <SelectField
            label="Industry"
            required
            value={values.industry}
            options={[
              { value: '', label: 'Select industry' },
              ...INDUSTRIES.map((item) => ({ value: item, label: item })),
            ]}
            onChange={(v) => patch({ industry: v, industryOther: v === 'Other' ? values.industryOther : '' })}
            error={fieldErrors.industry}
          />
          {values.industry === 'Other' ? (
            <Input
              label="Describe your industry"
              required
              value={values.industryOther}
              onChangeText={(v) => patch({ industryOther: v })}
              error={fieldErrors.industryOther}
            />
          ) : null}
          <Input
            label="Business email"
            required
            autoCapitalize="none"
            keyboardType="email-address"
            value={values.businessEmail}
            onChangeText={(v) => patch({ businessEmail: v })}
            error={fieldErrors.businessEmail}
          />
          <Input
            label="Business phone"
            required
            keyboardType="phone-pad"
            value={values.businessPhone}
            onChangeText={(v) => patch({ businessPhone: v })}
            error={fieldErrors.businessPhone}
          />
          <Input
            label="Website"
            optional
            autoCapitalize="none"
            keyboardType="url"
            value={values.website}
            onChangeText={(v) => patch({ website: v })}
            error={fieldErrors.website}
          />

          <Text style={styles.sectionLabel}>Location</Text>
          <Text style={styles.hint}>Search or pin your address so customers and staff share the same place.</Text>
          <AddressLocationPicker
            required
            fieldError={fieldErrors.address}
            value={values.address}
            latitude={values.latitude}
            longitude={values.longitude}
            onChangeText={(address) => patch({ address })}
            onPlaceSelected={(place) => {
              const cleared =
                !place.line1 &&
                !place.formattedAddress &&
                place.latitude == null &&
                place.longitude == null;
              patch({
                address: place.line1 || place.formattedAddress,
                ...(cleared ? { addressLine2: '' } : {}),
                city: place.city || '',
                state: place.state || '',
                country: place.country || '',
                postalCode: place.postalCode || '',
                latitude: place.latitude ?? null,
                longitude: place.longitude ?? null,
              });
            }}
          />
          <Input
            label="Flat, floor, building or landmark"
            required
            hint="Add door-level detail here — Google search only fills the street / area."
            placeholder="Shop 12, Ground floor, near City Mall"
            value={values.addressLine2}
            onChangeText={(v) => patch({ addressLine2: v })}
            error={fieldErrors.addressLine2}
          />
          <Input
            label="Country"
            required
            value={values.country}
            onChangeText={(v) => patch({ country: v })}
            editable={!(values.latitude != null && values.longitude != null)}
            error={fieldErrors.country}
          />
          <Input
            label="State"
            required
            value={values.state}
            onChangeText={(v) => patch({ state: v })}
            editable={!(values.latitude != null && values.longitude != null)}
            error={fieldErrors.state}
          />
          <Input
            label="City"
            required
            value={values.city}
            onChangeText={(v) => patch({ city: v })}
            editable={!(values.latitude != null && values.longitude != null)}
            error={fieldErrors.city}
          />
          <Input
            label="Postal code"
            required
            value={values.postalCode}
            onChangeText={(v) => patch({ postalCode: v })}
            editable={!(values.latitude != null && values.longitude != null)}
            error={fieldErrors.postalCode}
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Text style={styles.sectionLabel}>Owner account</Text>
          <Text style={styles.hint}>This person will manage the workspace and receive billing emails.</Text>
          <Input
            label="First name"
            required
            value={values.firstName}
            onChangeText={(v) => patch({ firstName: v })}
            error={fieldErrors.firstName}
          />
          <Input
            label="Last name"
            required
            value={values.lastName}
            onChangeText={(v) => patch({ lastName: v })}
            error={fieldErrors.lastName}
          />
          <Input
            label="Display name"
            required
            value={values.displayName}
            onChangeText={(v) => patch({ displayName: v })}
            error={fieldErrors.displayName}
            hint="How your name should appear in the workspace."
          />
          <Input
            label="Email"
            required
            autoCapitalize="none"
            keyboardType="email-address"
            value={values.email}
            editable={!values.googleIdToken}
            onChangeText={(v) => {
              patch({ email: v });
              if (ownerOtpSent) setOwnerOtpSent(false);
            }}
            error={fieldErrors.email}
          />
          {values.googleIdToken ? (
            <View style={styles.googleLinked}>
              <Text style={styles.googleLinkedTitle}>Continuing with Google</Text>
              <Text style={styles.googleLinkedCopy}>
                {values.email}. Email verification is not required.
              </Text>
            </View>
          ) : (
            <View style={styles.otpBlock}>
              <Button
                label={sendingOtp ? 'Sending…' : ownerOtpSent ? 'Resend code' : 'Send email code'}
                variant="outline"
                size="sm"
                icon="mail"
                disabled={sendingOtp || !values.email.trim()}
                onPress={() => {
                  void (async () => {
                    const emailError = emailFieldError(values.email);
                    if (emailError) {
                      setFieldErrors({ email: emailError });
                      return;
                    }
                    setSendingOtp(true);
                    try {
                      await opsClient.auth.sendOtp({
                        client: 'ops',
                        channel: 'email',
                        identifier: values.email.trim(),
                        purpose: 'signup',
                      });
                      setOwnerOtpSent(true);
                      setError(null);
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to send verification code.'));
                    } finally {
                      setSendingOtp(false);
                    }
                  })();
                }}
              />
              <Text style={styles.otpHint}>
                {ownerOtpSent
                  ? `Code sent to ${values.email}`
                  : 'We will email a 6-digit code to verify this address.'}
              </Text>
              <Input
                label="Email verification code"
                required
                keyboardType="number-pad"
                placeholder="6-digit code"
                value={values.ownerOtpCode}
                onChangeText={(v) => patch({ ownerOtpCode: v })}
                error={fieldErrors.ownerOtpCode}
              />
            </View>
          )}
          <Input
            label="Mobile"
            required
            keyboardType="phone-pad"
            value={values.mobile}
            onChangeText={(v) => patch({ mobile: v })}
            error={fieldErrors.mobile}
          />
          {!values.googleIdToken ? (
            <>
              <Text style={styles.googleDivider}>Or continue with Google</Text>
              <GoogleSignInButton
                onIdToken={async (idToken) => {
                  try {
                    await loginWithGoogle(idToken);
                  } catch (err) {
                    if (!isGoogleAccountNotRegistered(err)) throw err;
                    const claims = decodeGoogleIdToken(idToken);
                    const nextDisplay =
                      values.displayName ||
                      [claims.given_name, claims.family_name].filter(Boolean).join(' ');
                    patch({
                      googleIdToken: idToken,
                      email: claims.email || values.email,
                      firstName: claims.given_name || values.firstName,
                      lastName: claims.family_name || values.lastName,
                      displayName: nextDisplay,
                      businessEmail: values.businessEmail || claims.email || '',
                      ownerOtpCode: '',
                    });
                    setOwnerOtpSent(false);
                  }
                }}
              />
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Agreements</Text>
          <Pressable style={styles.checkRow} onPress={() => patch({ acceptTerms: !values.acceptTerms })}>
            <View style={[styles.checkbox, values.acceptTerms && styles.checkboxOn]}>
              {values.acceptTerms ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>
              I accept the{' '}
              <Text style={styles.link} onPress={() => openLegalPage('/terms')}>
                Terms & Conditions
              </Text>
            </Text>
          </Pressable>
          {fieldErrors.acceptTerms ? <Text style={styles.error}>{fieldErrors.acceptTerms}</Text> : null}
          <Pressable style={styles.checkRow} onPress={() => patch({ acceptPrivacy: !values.acceptPrivacy })}>
            <View style={[styles.checkbox, values.acceptPrivacy && styles.checkboxOn]}>
              {values.acceptPrivacy ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>
              I accept the{' '}
              <Text style={styles.link} onPress={() => openLegalPage('/privacy')}>
                Privacy Policy
              </Text>
            </Text>
          </Pressable>
          {fieldErrors.acceptPrivacy ? <Text style={styles.error}>{fieldErrors.acceptPrivacy}</Text> : null}
          <Input
            label="Affiliate code"
            optional
            autoCapitalize="characters"
            value={values.affiliateCode || ''}
            onChangeText={(v) => patch({ affiliateCode: v.toUpperCase() })}
            hint="If a partner referred you, enter their code. You can leave this blank."
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text style={styles.sectionLabel}>Workspace preferences</Text>
          <Text style={styles.hint}>Currency, time, and language for invoices and schedules.</Text>
          <SelectField
            label="Currency"
            required
            value={values.currency}
            options={CURRENCIES}
            onChange={(v) => patch({ currency: v })}
          />
          <SelectField
            label="Timezone"
            required
            value={values.timezone}
            options={TIMEZONES}
            onChange={(v) => patch({ timezone: v })}
          />
          <SelectField
            label="Language"
            required
            value={values.language}
            options={LANGUAGES}
            onChange={(v) => patch({ language: v })}
          />
          <SelectField
            label="Week starts on"
            required
            value={values.weekStartDay}
            options={WEEK_START_DAYS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(v) => patch({ weekStartDay: v as 'monday' | 'sunday' })}
          />
          <SelectField
            label="Date format"
            required
            value={values.dateFormat}
            options={DATE_FORMATS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(v) => patch({ dateFormat: v })}
          />
          <SelectField
            label="Time format"
            required
            value={values.timeFormat}
            options={TIME_FORMATS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(v) => patch({ timeFormat: v as '12h' | '24h' })}
          />

          <View style={styles.hoursHeader}>
            <Text style={styles.sectionLabel}>Business hours</Text>
            <View style={styles.skipRow}>
              <Text style={styles.hint}>Skip for now</Text>
              <Switch
                value={values.skipHours}
                trackColor={{ true: colors.primary }}
                onValueChange={(skipHours) => patch({ skipHours })}
              />
            </View>
          </View>
          {values.skipHours ? (
            <Text style={styles.hint}>You can set hours later in Settings.</Text>
          ) : (
            <>
              {fieldErrors.hours ? <Text style={styles.error}>{fieldErrors.hours}</Text> : null}
              {HOUR_DAYS.map((day) => {
                const row = values.businessHours[day.value];
                return (
                  <View key={day.value} style={styles.hoursCard}>
                    <View style={styles.hoursRow}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                      <Switch
                        value={row.open}
                        trackColor={{ true: colors.primary }}
                        onValueChange={(open) => updateHours(day.value, { open })}
                      />
                    </View>
                    {row.open ? (
                      <View style={styles.times}>
                        <TimeField
                          label="Opens"
                          value={row.start}
                          onChange={(start) => updateHours(day.value, { start })}
                        />
                        <TimeField
                          label="Closes"
                          value={row.end}
                          onChange={(end) => updateHours(day.value, { end })}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          )}

          <Text style={styles.sectionLabel}>Products</Text>
          {fieldErrors.products ? <Text style={styles.error}>{fieldErrors.products}</Text> : null}
          <Text style={styles.hint}>Select one or both. Packages stay inside the product card.</Text>
          {PRODUCT_CATALOG.map((product) => {
            const selected = values.selectedProducts.includes(product.id);
            return (
              <View key={product.id} style={[styles.productCard, selected ? styles.productCardSelected : null]}>
                <Pressable
                  onPress={() => {
                    if (selected && values.selectedProducts.length === 1) return;
                    const selectedProducts = selected
                      ? values.selectedProducts.filter((id) => id !== product.id)
                      : [...values.selectedProducts, product.id];
                    patch({ selectedProducts });
                  }}
                >
                  <Text style={styles.packageTitle}>
                    {selected ? '✓  ' : ''}
                    {product.name}
                  </Text>
                  <Text style={styles.hint}>{product.description}</Text>
                </Pressable>
                <Text style={styles.packageLabel}>Choose a package</Text>
                {plansForProduct(product.id).map((plan) => {
                  const planSelected = selected && values.planCodes[product.id] === plan.plan_code;
                  return (
                    <Pressable
                      key={plan.plan_code}
                      onPress={() => {
                        const selectedProducts = selected
                          ? values.selectedProducts
                          : [...values.selectedProducts, product.id];
                        patch({
                          selectedProducts,
                          planCodes: { ...values.planCodes, [product.id]: plan.plan_code },
                        });
                      }}
                      style={[styles.packageCard, planSelected ? styles.packageCardSelected : null]}
                    >
                      <Text style={styles.packageTitle}>
                        {formatPlanDisplayName(plan.name, plan.plan_code)}
                        {isRecommendedPlanCode(plan.plan_code) ? ' · Recommended' : ''}
                      </Text>
                      <Text style={styles.packageMeta}>
                        {formatInrFromPaise(plan.amount_paise)
                          ? `${formatInrFromPaise(plan.amount_paise)}/month`
                          : 'Trial first'}
                      </Text>
                      <Text style={styles.hint}>{plan.description}</Text>
                      <Text style={styles.packageMeta}>{planSeatLine(plan)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Input
            label="Primary color"
            value={values.primaryColor}
            onChangeText={(v) => patch({ primaryColor: v })}
            autoCapitalize="none"
          />
          <Input
            label="Secondary color"
            value={values.secondaryColor}
            onChangeText={(v) => patch({ secondaryColor: v })}
            autoCapitalize="none"
          />
          <ImagePickerButton
            label="Logo"
            optional
            variant="card"
            valueUri={values.logoAsset?.uri || null}
            onPicked={(asset: ImagePickerAsset) => patch({ logoAsset: asset })}
            helperText="Optional. You can update this later in Settings."
          />
        </>
      ) : null}

      {step === 4 ? (
        <>
          {error ? <FormAlert message={error} /> : null}
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionLabel}>Business</Text>
              <Button label="Edit" variant="ghost" onPress={() => setStep(0)} />
            </View>
            <Text style={styles.reviewLine}>
              {values.businessName} · {categoryLabel} · {industryLabel}
            </Text>
            <Text style={styles.reviewLine}>
              {values.businessEmail} · {values.businessPhone}
            </Text>
            {values.website.trim() ? <Text style={styles.reviewLine}>{values.website.trim()}</Text> : null}
            <Text style={styles.reviewLine}>
              {[values.addressLine2, values.address, values.city, values.state, values.country, values.postalCode]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionLabel}>Owner</Text>
              <Button label="Edit" variant="ghost" onPress={() => setStep(1)} />
            </View>
            <Text style={styles.reviewLine}>
              {values.firstName} {values.lastName} ({values.displayName})
            </Text>
            <Text style={styles.reviewLine}>
              {values.email} · {values.mobile}
            </Text>
            {values.googleIdToken ? <Text style={styles.reviewLine}>Continuing with Google</Text> : null}
            {values.affiliateCode ? (
              <Text style={styles.reviewLine}>Affiliate code: {values.affiliateCode}</Text>
            ) : null}
          </View>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionLabel}>Preferences</Text>
              <Button label="Edit" variant="ghost" onPress={() => setStep(2)} />
            </View>
            <Text style={styles.reviewLine}>
              {values.currency} · {values.timezone} · {values.language}
            </Text>
            <Text style={styles.reviewLine}>
              {values.dateFormat} · {values.timeFormat} · Week starts {values.weekStartDay}
            </Text>
            {values.selectedProducts.map((productId) => {
              const plan = plansForProduct(productId).find((item) => item.plan_code === values.planCodes[productId]);
              return (
                <Text key={productId} style={styles.reviewLine}>
                  {getProductName(productId)} ·{' '}
                  {plan ? formatPlanDisplayName(plan.name, plan.plan_code) : values.planCodes[productId]}
                </Text>
              );
            })}
            <Text style={styles.reviewLine}>
              Hours: {values.skipHours ? 'Skipped for now' : summarizeWeeklyHours(values.businessHours)}
            </Text>
          </View>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionLabel}>Branding</Text>
              <Button label="Edit" variant="ghost" onPress={() => setStep(3)} />
            </View>
            <Text style={styles.reviewLine}>
              {values.primaryColor} / {values.secondaryColor}
            </Text>
            {values.logoAsset?.uri ? (
              <Image source={{ uri: values.logoAsset.uri }} style={styles.reviewLogo} />
            ) : null}
          </View>
        </>
      ) : null}

      {step !== 4 && error ? <FormAlert message={error} /> : null}
    </>
  );

  function goNext() {
    const nextErrors = validateStep();
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setError(Object.values(nextErrors)[0]);
      return;
    }
    setFieldErrors({});
    setError(null);
    setStep((s) => s + 1);
  }

  const footerActions = (
    <View style={styles.footerRow}>
      {step > 0 ? (
        <Button
          label="Back"
          variant="outline"
          size="sm"
          icon="arrow-left"
          style={styles.footerBtn}
          onPress={() => setStep((s) => s - 1)}
        />
      ) : (
        <Button
          label="Sign in"
          variant="outline"
          size="sm"
          icon="log-in"
          style={styles.footerBtn}
          onPress={() => navigation.navigate('Login')}
        />
      )}
      {step < STEPS.length - 1 ? (
        <Button
          label="Clear"
          variant="outline"
          size="sm"
          icon="rotate-ccw"
          style={styles.footerBtn}
          onPress={clearCurrentStep}
        />
      ) : null}
      {step < STEPS.length - 1 ? (
        <Button label="Continue" size="sm" icon="arrow-right" style={styles.footerPrimary} onPress={goNext} />
      ) : (
        <Button
          label={submitting ? 'Creating…' : 'Create account'}
          loading={submitting}
          size="sm"
          icon="check"
          style={styles.footerPrimary}
          onPress={() => void finish()}
        />
      )}
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopCanvas}>
        <RefreshableScrollView contentContainerStyle={styles.desktopScroll}>
          <View style={styles.desktopCard}>
            <Text style={styles.desktopKicker}>New workspace</Text>
            <Text style={styles.desktopTitle}>Create your workspace</Text>
            <Text style={styles.desktopStep}>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </Text>
            <View style={styles.desktopBody}>
              {stepFields}
              <View style={styles.actions}>{footerActions}</View>
            </View>
          </View>
        </RefreshableScrollView>
      </View>
    );
  }

  return (
    <View style={styles.mobileRoot}>
      <View style={[styles.progressHeader, { paddingTop: insets.top }]}>
        <View style={styles.progressMeta}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.progressBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={styles.progressStepName}>{STEPS[step]}</Text>
          <Text style={styles.progressCount}>
            {step + 1} / {STEPS.length}
          </Text>
        </View>
        <View
          style={styles.progressSegments}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}
        >
          {STEPS.map((label, index) => {
            const filled = index <= step;
            const current = index === step;
            return (
              <View
                key={label}
                style={[
                  styles.progressSegment,
                  filled ? styles.progressSegmentFilled : null,
                  current ? styles.progressSegmentCurrent : null,
                ]}
              />
            );
          })}
        </View>
      </View>
      <FormScreen
        contentContainerStyle={styles.content}
        footer={footerActions}
        footerStyle={styles.footerChrome}
      >
        {stepFields}
      </FormScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: { flex: 1, backgroundColor: colors.card },
  progressHeader: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    zIndex: 2,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  progressBack: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStepName: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '700',
    flex: 1,
  },
  progressCount: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
  },
  progressSegments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  progressSegmentFilled: {
    backgroundColor: colors.primary,
  },
  progressSegmentCurrent: {
    backgroundColor: colors.primary,
    height: 9,
  },
  content: { gap: spacing.md, paddingTop: spacing.md },
  footerChrome: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  footerRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  footerBtn: { flex: 1 },
  footerPrimary: { flex: 1.6 },
  hint: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
  googleLinked: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: 2,
  },
  googleLinkedTitle: { ...typography.label, color: colors.foreground },
  googleLinkedCopy: { ...typography.caption, color: colors.mutedForeground },
  otpBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  otpHint: { ...typography.caption, color: colors.mutedForeground },
  googleDivider: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  sectionLabel: { ...typography.body, color: colors.foreground, fontWeight: '600', marginTop: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  checkLabel: { ...typography.body, color: colors.foreground, flex: 1 },
  link: { color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  productCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    ...shadows.soft,
  },
  productCardSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  packageLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.xs,
  },
  packageCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.card,
    ...shadows.soft,
  },
  packageCardSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  packageTitle: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  packageMeta: { ...typography.caption, color: colors.mutedForeground },
  hoursHeader: { gap: spacing.sm, marginTop: spacing.sm },
  skipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  hoursCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
    ...shadows.soft,
  },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  times: { gap: spacing.sm },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.xs,
    ...shadows.soft,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  reviewLine: { ...typography.body, color: colors.foreground },
  reviewLogo: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.muted,
  },
  actions: { gap: spacing.md, marginTop: spacing.lg },
  desktopCanvas: { flex: 1, backgroundColor: colors.background },
  desktopScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.desktopGutter,
  },
  desktopCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxxl,
    gap: spacing.md,
    ...shadows.soft,
  },
  desktopKicker: {
    ...typography.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  desktopTitle: { ...typography.heading, fontSize: 24, color: colors.foreground },
  desktopStep: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.sm },
  desktopBody: { gap: spacing.md },
});
