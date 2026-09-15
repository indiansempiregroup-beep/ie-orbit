import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { BillingPlanCatalogItem } from '@ie-orbit/sdk';
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
import { brand, colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { layout } from '../../theme/layout';
import { getApiErrorMessage } from '../../utils/format';
import { emailFieldError } from '../../utils/emailValidation';
import { indianMobileError, requiredMessage } from '../../utils/formValidation';
import { decodeGoogleIdToken, isGoogleAccountNotRegistered } from '../../utils/googleAuth';
import { PRODUCT_CATALOG, formatInrFromPaise, formatPlanDisplayName, getProductName, getRecommendedPlanCode, isRecommendedPlanCode, planSeatLine } from '../../utils/products';
import { opsClient } from '../../api/client';
import {
  defaultWeeklyHours,
  HOUR_DAYS,
  provisionWorkspace,
  type RegisterWizardValues,
  type WeeklyHours,
} from '../../utils/provisionWorkspace';
import type { AuthStackParamList } from '../../navigation/types';

const STEPS = ['Account', 'Business', 'Preferences', 'Branding'] as const;

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'UTC', label: 'UTC' },
];

const CURRENCIES = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'EUR', label: 'EUR' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
];

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
      description: 'Multi-location scheduling with full business intelligence.',
      billing_interval: 'monthly',
      trial_days: 15,
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
      description: 'Catalog, POS, inventory, and billing for a single location.',
      billing_interval: 'monthly',
      trial_days: 15,
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
      description: 'Multi-location commerce with advanced inventory and billing.',
      billing_interval: 'monthly',
      trial_days: 15,
      is_default: false,
      max_staff: 5,
      max_branches: 2,
      max_extra_staff: null,
      max_extra_offices: null,
      currency: 'INR',
    },
  ],
};

function defaultValues(): RegisterWizardValues {
  return {
    businessName: '',
    displayName: '',
    businessEmail: '',
    businessPhone: '',
    city: '',
    country: 'IN',
    state: '',
    address: '',
    postalCode: '',
    latitude: null,
    longitude: null,
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    ownerOtpCode: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    language: 'en',
    selectedProducts: ['appointie'],
    planCodes: { appointie: 'appointie-pro' },
    skipHours: false,
    businessHours: defaultWeeklyHours(),
    primaryColor: '#0f766e',
    secondaryColor: '#14b8a6',
    logoAsset: null,
    affiliateCode: '',
    googleIdToken: '',
  };
}

function initialValues(params?: AuthStackParamList['RegisterWizard']): RegisterWizardValues {
  const values = defaultValues();
  if (!params?.googleIdToken) return values;
  return {
    ...values,
    googleIdToken: params.googleIdToken,
    email: params.email || '',
    firstName: params.firstName || '',
    lastName: params.lastName || '',
    businessEmail: params.email || '',
  };
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
      if (!values.firstName.trim()) next.firstName = requiredMessage('First name');
      if (!values.lastName.trim()) next.lastName = requiredMessage('Last name');
      const emailError = emailFieldError(values.email);
      if (emailError) next.email = emailError;
      const mobileError = indianMobileError(values.mobile, true);
      if (mobileError) next.mobile = mobileError;
      if (!values.googleIdToken && !/^\d{6}$/.test(values.ownerOtpCode.trim())) {
        next.ownerOtpCode = 'Enter the 6-digit code from your email';
      }
    }
    if (step === 1) {
      if (!values.businessName.trim()) next.businessName = requiredMessage('Business name');
      if (!values.displayName.trim()) next.displayName = requiredMessage('Display name');
      const businessEmailError = emailFieldError(values.businessEmail);
      if (businessEmailError) next.businessEmail = businessEmailError;
      const phoneError = indianMobileError(values.businessPhone, true);
      if (phoneError) next.businessPhone = phoneError;
      if (!values.address.trim()) next.address = requiredMessage('Address');
      if (!values.city.trim()) next.city = requiredMessage('City');
      if (!values.country.trim()) next.country = requiredMessage('Country');
      if (!values.postalCode.trim()) next.postalCode = requiredMessage('Postal code');
      if (values.latitude == null || values.longitude == null) {
        next.address = next.address || 'Select a map location for this address.';
      }
    }
    if (step === 2) {
      if (!values.selectedProducts.length) next.products = 'Select at least one product.';
      const missingPlan = values.selectedProducts.find((productId) => !values.planCodes[productId]);
      if (missingPlan) next.products = `Select a ${getProductName(missingPlan)} package.`;
      if (!values.skipHours) {
        const openDays = HOUR_DAYS.filter((day) => values.businessHours[day.value].open);
        if (!openDays.length) next.hours = 'Open at least one day, or skip hours for now.';
        const invalid = openDays.some((day) => values.businessHours[day.value].start >= values.businessHours[day.value].end);
        if (invalid) next.hours = 'Closing time must be after opening time.';
      }
    }
    return next;
  }

  function clearCurrentStep() {
    const defaults = defaultValues();
    if (step === 0) {
      patch({
        firstName: '',
        lastName: '',
        email: values.googleIdToken ? values.email : '',
        mobile: '',
        ownerOtpCode: '',
        affiliateCode: '',
      });
      setOwnerOtpSent(false);
    } else if (step === 1) {
      patch({
        businessName: '',
        displayName: '',
        businessEmail: '',
        businessPhone: '',
        address: '',
        city: '',
        state: '',
        country: defaults.country,
        postalCode: '',
        latitude: null,
        longitude: null,
      });
    } else if (step === 2) {
      patch({
        timezone: defaults.timezone,
        currency: defaults.currency,
        language: defaults.language,
        selectedProducts: defaults.selectedProducts,
        planCodes: defaults.planCodes,
        skipHours: defaults.skipHours,
        businessHours: defaultWeeklyHours(),
      });
    } else {
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

  const stepFields = (
    <>
      {step === 0 ? (
        <>
          {!values.googleIdToken ? (
            <GoogleSignInButton
              onIdToken={async (idToken) => {
                try {
                  await loginWithGoogle(idToken);
                } catch (err) {
                  if (!isGoogleAccountNotRegistered(err)) throw err;
                  const claims = decodeGoogleIdToken(idToken);
                  patch({
                    googleIdToken: idToken,
                    email: claims.email || values.email,
                    firstName: claims.given_name || values.firstName,
                    lastName: claims.family_name || values.lastName,
                    businessEmail: values.businessEmail || claims.email || '',
                  });
                }
              }}
            />
          ) : (
            <View style={styles.googleLinked}>
              <Text style={styles.googleLinkedTitle}>Continuing with Google</Text>
              <Text style={styles.googleLinkedCopy}>{values.email}</Text>
            </View>
          )}
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
            label="Email"
            required
            autoCapitalize="none"
            keyboardType="email-address"
            value={values.email}
            editable={!values.googleIdToken}
            onChangeText={(v) => patch({ email: v })}
            error={fieldErrors.email}
          />
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
              <Button
                label={sendingOtp ? 'Sending…' : ownerOtpSent ? 'Resend email code' : 'Send email verification code'}
                variant="outline"
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
              <Input
                label="Email verification code"
                required
                keyboardType="number-pad"
                value={values.ownerOtpCode}
                onChangeText={(v) => patch({ ownerOtpCode: v })}
                error={fieldErrors.ownerOtpCode}
                hint={ownerOtpSent ? `Code sent to ${values.email}` : 'Send a code first, then enter it here.'}
              />
            </>
          ) : null}
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

      {step === 1 ? (
        <>
          <Input
            label="Business name"
            required
            value={values.businessName}
            onChangeText={(v) => patch({ businessName: v, displayName: values.displayName || v })}
            error={fieldErrors.businessName}
          />
          <Input
            label="Display name"
            required
            value={values.displayName}
            onChangeText={(v) => patch({ displayName: v })}
            error={fieldErrors.displayName}
          />
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
            label="Phone"
            required
            keyboardType="phone-pad"
            value={values.businessPhone}
            onChangeText={(v) => patch({ businessPhone: v })}
            error={fieldErrors.businessPhone}
          />
          <AddressLocationPicker
            required
            fieldError={fieldErrors.address}
            value={values.address}
            latitude={values.latitude}
            longitude={values.longitude}
            onChangeText={(address) => patch({ address })}
            onPlaceSelected={(place) =>
              patch({
                address: place.line1 || place.formattedAddress,
                city: place.city || '',
                state: place.state || '',
                country: place.country || '',
                postalCode: place.postalCode || '',
                latitude: place.latitude ?? null,
                longitude: place.longitude ?? null,
              })
            }
          />
        <Input
          label="City"
          required
          value={values.city}
          onChangeText={(v) => patch({ city: v })}
          editable={!(values.latitude != null && values.longitude != null)}
          error={fieldErrors.city}
        />
        <Input label="State" value={values.state} onChangeText={(v) => patch({ state: v })} editable={!(values.latitude != null && values.longitude != null)} />
        <Input
          label="Country code"
          required
          value={values.country}
          onChangeText={(v) => patch({ country: v })}
          autoCapitalize="characters"
          editable={!(values.latitude != null && values.longitude != null)}
          error={fieldErrors.country}
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

      {step === 2 ? (
        <>
          <SelectField
            label="Timezone"
            required
            value={values.timezone}
            options={TIMEZONES}
            onChange={(v) => patch({ timezone: v })}
          />
          <SelectField
            label="Currency"
            required
            value={values.currency}
            options={CURRENCIES}
            onChange={(v) => patch({ currency: v })}
          />
          <SelectField
            label="Language"
            required
            value={values.language}
            options={LANGUAGES}
            onChange={(v) => patch({ language: v })}
          />
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
                  <Text style={styles.packageTitle}>{selected ? '✓  ' : ''}{product.name}</Text>
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
                        {formatInrFromPaise(plan.amount_paise) ? `${formatInrFromPaise(plan.amount_paise)}/month` : 'Trial first'}
                      </Text>
                      <Text style={styles.hint}>{plan.description}</Text>
                      <Text style={styles.packageMeta}>
                        {planSeatLine(plan)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
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

      {error ? <FormAlert message={error} /> : null}

      <View style={styles.actions}>
        {step > 0 ? <Button label="Back" variant="outline" onPress={() => setStep((s) => s - 1)} /> : null}
        <Button label="Clear" variant="ghost" onPress={clearCurrentStep} />
        {step < STEPS.length - 1 ? (
          <Button
            label="Continue"
            fullWidth
            onPress={() => {
              const nextErrors = validateStep();
              if (Object.keys(nextErrors).length) {
                setFieldErrors(nextErrors);
                setError(Object.values(nextErrors)[0]);
                return;
              }
              setFieldErrors({});
              setError(null);
              setStep((s) => s + 1);
            }}
          />
        ) : (
          <Button label="Create workspace" loading={submitting} fullWidth onPress={() => void finish()} />
        )}
        <Button label="Already have an account?" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isDesktop ? (
        <View style={styles.desktopCanvas}>
          <RefreshableScrollView contentContainerStyle={styles.desktopScroll}>
            <View style={styles.desktopCard}>
              <Text style={styles.desktopKicker}>New workspace</Text>
              <Text style={styles.desktopTitle}>Register your business</Text>
              <Text style={styles.desktopStep}>
                Step {step + 1} of {STEPS.length}: {STEPS[step]}
              </Text>
              <View style={styles.desktopBody}>{stepFields}</View>
            </View>
          </RefreshableScrollView>
        </View>
      ) : (
        <>
          <LinearGradient
            colors={[brand.gradientStart, brand.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, { paddingTop: insets.top + spacing.lg }]}
          >
            <Text style={styles.kicker}>New workspace</Text>
            <Text style={styles.title}>Register your business</Text>
            <Text style={styles.stepLabel}>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </Text>
          </LinearGradient>
          <RefreshableScrollView contentContainerStyle={styles.content}>{stepFields}</RefreshableScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.lg, backgroundColor: brand.primary },
  kicker: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { ...typography.heading, fontSize: 24, color: colors.primaryForeground, marginTop: spacing.sm },
  stepLabel: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm },
  content: { padding: spacing.xxl, gap: spacing.md, paddingBottom: spacing.xxxl },
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
  sectionLabel: { ...typography.body, color: colors.foreground, fontWeight: '600', marginTop: spacing.sm },
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
