import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SelectField } from '../../components/SelectField';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { brand, colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { PRODUCT_CATALOG } from '../../utils/products';
import { provisionWorkspace, type RegisterWizardValues } from '../../utils/provisionWorkspace';
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
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    password: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    language: 'en',
    selectedProduct: 'appointie',
    primaryColor: '#0f766e',
    secondaryColor: '#14b8a6',
    skipBranding: false,
    logoAsset: null,
  };
}

export function RegisterWizardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const { bootstrapSession } = useAuth();
  const { initializeWorkspace } = useWorkspace();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterWizardValues>(defaultValues);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(partial: Partial<RegisterWizardValues>) {
    setValues((current) => ({ ...current, ...partial }));
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
    return null;
  }

  async function finish(skipBranding = false) {
    setSubmitting(true);
    setError(null);
    try {
      const payload = await provisionWorkspace({ ...values, skipBranding });
      await bootstrapSession(payload);
      await initializeWorkspace(payload.tenant.id, payload.business.id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to create workspace.'));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.kicker}>New workspace</Text>
        <Text style={styles.title}>Register your business</Text>
        <Text style={styles.stepLabel}>
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </Text>
      </View>

      <RefreshableScrollView contentContainerStyle={styles.content}>
        {step === 0 ? (
          <>
            <Input label="First name" value={values.firstName} onChangeText={(v) => patch({ firstName: v })} />
            <Input label="Last name" value={values.lastName} onChangeText={(v) => patch({ lastName: v })} />
            <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={values.email} onChangeText={(v) => patch({ email: v })} />
            <Input label="Mobile" keyboardType="phone-pad" value={values.mobile} onChangeText={(v) => patch({ mobile: v })} />
            <Input label="Password" secureTextEntry value={values.password} onChangeText={(v) => patch({ password: v })} />
            <Input label="Confirm password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Input label="Business name" value={values.businessName} onChangeText={(v) => patch({ businessName: v, displayName: values.displayName || v })} />
            <Input label="Display name" value={values.displayName} onChangeText={(v) => patch({ displayName: v })} />
            <Input label="Business email" autoCapitalize="none" keyboardType="email-address" value={values.businessEmail} onChangeText={(v) => patch({ businessEmail: v })} />
            <Input label="Phone" keyboardType="phone-pad" value={values.businessPhone} onChangeText={(v) => patch({ businessPhone: v })} />
            <Input label="Address" value={values.address} onChangeText={(v) => patch({ address: v })} />
            <Input label="City" value={values.city} onChangeText={(v) => patch({ city: v })} />
            <Input label="State" value={values.state} onChangeText={(v) => patch({ state: v })} />
            <Input label="Country code" value={values.country} onChangeText={(v) => patch({ country: v })} autoCapitalize="characters" />
            <Input label="Postal code" value={values.postalCode} onChangeText={(v) => patch({ postalCode: v })} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <SelectField label="Timezone" value={values.timezone} options={TIMEZONES} onChange={(v) => patch({ timezone: v })} />
            <SelectField label="Currency" value={values.currency} options={CURRENCIES} onChange={(v) => patch({ currency: v })} />
            <SelectField label="Language" value={values.language} options={LANGUAGES} onChange={(v) => patch({ language: v })} />
            <SelectField
              label="Product"
              value={values.selectedProduct}
              options={PRODUCT_CATALOG.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => patch({ selectedProduct: v })}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.hint}>Optional branding for your workspace. You can skip and update later in settings.</Text>
            <Input label="Primary color" value={values.primaryColor} onChangeText={(v) => patch({ primaryColor: v })} autoCapitalize="none" />
            <Input label="Secondary color" value={values.secondaryColor} onChangeText={(v) => patch({ secondaryColor: v })} autoCapitalize="none" />
            <ImagePickerButton
              label="Logo"
              onPicked={(asset: ImagePickerAsset) => patch({ logoAsset: asset, skipBranding: false })}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
            <>
              <Button label="Create workspace" loading={submitting} fullWidth onPress={() => void finish(false)} />
              <Button label="Skip branding & create" variant="ghost" loading={submitting} onPress={() => void finish(true)} />
            </>
          )}
          <Button label="Already have an account?" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </View>
      </RefreshableScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.lg, backgroundColor: brand.primary },
  kicker: { ...typography.caption, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 },
  title: { ...typography.heading, fontSize: 24, color: colors.primaryForeground, marginTop: spacing.sm },
  stepLabel: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm },
  content: { padding: spacing.xxl, gap: spacing.md, paddingBottom: spacing.xxxl },
  hint: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
  actions: { gap: spacing.md, marginTop: spacing.lg },
});
