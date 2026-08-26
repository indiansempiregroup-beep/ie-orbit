import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Button } from '../../components/ui/Button';
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
import { brand, colors, radius, spacing, typography } from '../../theme/tokens';
import { layout } from '../../theme/layout';
import { getApiErrorMessage } from '../../utils/format';
import { PRODUCT_CATALOG, getProductName, stripPlanProductPrefix } from '../../utils/products';
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
    password: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    language: 'en',
    selectedProducts: ['appointie'],
    planCodes: { appointie: 'appointie-starter' },
    skipHours: false,
    businessHours: defaultWeeklyHours(),
    primaryColor: '#0f766e',
    secondaryColor: '#14b8a6',
    logoAsset: null,
    affiliateCode: '',
  };
}

export function RegisterWizardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { bootstrapSession } = useAuth();
  const { initializeWorkspace } = useWorkspace();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterWizardValues>(defaultValues);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const fallback = plans.find((plan) => plan.is_default) ?? plans[0];
      if (fallback) {
        next[productId] = fallback.plan_code;
        changed = true;
      }
    }
    if (changed) patch({ planCodes: next });
  }, [catalogPlans, values.selectedProducts, values.planCodes]);

  function patch(partial: Partial<RegisterWizardValues>) {
    setValues((current) => ({ ...current, ...partial }));
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

  function validateStep(): string | null {
    if (step === 0) {
      if (!values.firstName.trim() || !values.email.trim() || !values.password) return 'Fill in account details.';
      if (values.password.length < 8) return 'Password must be at least 8 characters.';
      if (values.password !== confirmPassword) return 'Passwords do not match.';
    }
    if (step === 1) {
      if (!values.businessName.trim() || !values.businessEmail.trim()) return 'Business name and email are required.';
    }
    if (step === 2) {
      if (!values.selectedProducts.length) return 'Select at least one product.';
      const missingPlan = values.selectedProducts.find((productId) => !values.planCodes[productId]);
      if (missingPlan) return `Select a ${getProductName(missingPlan)} package.`;
      if (!values.skipHours) {
        const openDays = HOUR_DAYS.filter((day) => values.businessHours[day.value].open);
        if (!openDays.length) return 'Open at least one day, or skip hours for now.';
        const invalid = openDays.some((day) => values.businessHours[day.value].start >= values.businessHours[day.value].end);
        if (invalid) return 'Closing time must be after opening time.';
      }
    }
    return null;
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
          <Input label="First name" value={values.firstName} onChangeText={(v) => patch({ firstName: v })} />
          <Input label="Last name" value={values.lastName} onChangeText={(v) => patch({ lastName: v })} />
          <Input
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={values.email}
            onChangeText={(v) => patch({ email: v })}
          />
          <Input
            label="Mobile"
            keyboardType="phone-pad"
            value={values.mobile}
            onChangeText={(v) => patch({ mobile: v })}
          />
          <Input
            label="Password"
            secureTextEntry
            value={values.password}
            onChangeText={(v) => patch({ password: v })}
          />
          <Input
            label="Confirm password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Input
            label="Affiliate code (optional)"
            autoCapitalize="characters"
            value={values.affiliateCode || ''}
            onChangeText={(v) => patch({ affiliateCode: v.toUpperCase() })}
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Input
            label="Business name"
            value={values.businessName}
            onChangeText={(v) => patch({ businessName: v, displayName: values.displayName || v })}
          />
          <Input label="Display name" value={values.displayName} onChangeText={(v) => patch({ displayName: v })} />
          <Input
            label="Business email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={values.businessEmail}
            onChangeText={(v) => patch({ businessEmail: v })}
          />
          <Input
            label="Phone"
            keyboardType="phone-pad"
            value={values.businessPhone}
            onChangeText={(v) => patch({ businessPhone: v })}
          />
          <AddressLocationPicker
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
          <Input label="City" value={values.city} onChangeText={(v) => patch({ city: v })} />
          <Input label="State" value={values.state} onChangeText={(v) => patch({ state: v })} />
          <Input
            label="Country code"
            value={values.country}
            onChangeText={(v) => patch({ country: v })}
            autoCapitalize="characters"
          />
          <Input label="Postal code" value={values.postalCode} onChangeText={(v) => patch({ postalCode: v })} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <SelectField
            label="Timezone"
            value={values.timezone}
            options={TIMEZONES}
            onChange={(v) => patch({ timezone: v })}
          />
          <SelectField
            label="Currency"
            value={values.currency}
            options={CURRENCIES}
            onChange={(v) => patch({ currency: v })}
          />
          <SelectField
            label="Language"
            value={values.language}
            options={LANGUAGES}
            onChange={(v) => patch({ language: v })}
          />
          <Text style={styles.sectionLabel}>Products</Text>
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
                      <Text style={styles.packageTitle}>{stripPlanProductPrefix(plan.name)}</Text>
                      <Text style={styles.hint}>{plan.description}</Text>
                      <Text style={styles.packageMeta}>
                        {plan.max_staff ?? 1} staff · {plan.max_branches ?? 1} office
                        {(plan.max_branches ?? 1) === 1 ? '' : 's'}
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
            HOUR_DAYS.map((day) => {
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
            })
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
        {step < STEPS.length - 1 ? (
          <Button
            label="Continue"
            fullWidth
            onPress={() => {
              const message = validateStep();
              if (message) {
                setError(message);
                return;
              }
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
          <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
            <Text style={styles.kicker}>New workspace</Text>
            <Text style={styles.title}>Register your business</Text>
            <Text style={styles.stepLabel}>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </Text>
          </View>
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
  sectionLabel: { ...typography.body, color: colors.foreground, fontWeight: '600', marginTop: spacing.sm },
  productCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  productCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
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
  },
  packageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
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
