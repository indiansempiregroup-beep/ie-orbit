import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { uploadBrandingLogo } from '../../api/media';
import { CURRENCIES, TIMEZONES } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function BusinessEditScreen() {
  const client = useOpsClient();
  const { token } = useAuth();
  const { activeBusiness, businessId, tenantId, refreshWorkspace } = useWorkspace();
  const [businessName, setBusinessName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currency, setCurrency] = useState('INR');
  const [logoAsset, setLogoAsset] = useState<ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setBusinessName(activeBusiness.business_name ?? '');
    setDisplayName(activeBusiness.display_name ?? activeBusiness.business_name ?? '');
    setEmail(activeBusiness.email ?? '');
    setPrimaryContact(activeBusiness.primary_contact ?? '');
    setWebsite(activeBusiness.website ?? '');
    setAddressLine1(activeBusiness.address_line1 ?? '');
    setCity(activeBusiness.city ?? '');
    setState(activeBusiness.state ?? '');
    setPostalCode(activeBusiness.postal_code ?? '');
    setCountry(activeBusiness.country ?? '');
    setTimezone(activeBusiness.timezone || 'Asia/Kolkata');
    setCurrency(activeBusiness.currency || 'INR');
  }, [activeBusiness]);

  const timezoneOptions =
    timezone && !TIMEZONES.some((option) => option.value === timezone)
      ? [...TIMEZONES, { value: timezone, label: timezone }]
      : TIMEZONES;
  const currencyOptions =
    currency && !CURRENCIES.some((option) => option.value === currency)
      ? [...CURRENCIES, { value: currency, label: currency }]
      : CURRENCIES;

  return (
    <FormScreen
      footer={
        <Button
          label="Save changes"
          loading={loading}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!client || !businessId || !token || !tenantId) return;
            setLoading(true);
            setError(null);
            try {
              let logo = activeBusiness?.logo;
              if (logoAsset) {
                const uploaded = await uploadBrandingLogo({
                  token,
                  tenantId,
                  businessId,
                  asset: logoAsset,
                  displayName: displayName || activeBusiness?.business_name || 'Business',
                });
                logo = uploaded.public_url || uploaded.private_url || logo;
              }
              await client.businesses.patch(businessId, {
                business_name: businessName || displayName,
                display_name: displayName,
                email,
                timezone,
                currency,
                primary_contact: primaryContact || undefined,
                website: website || undefined,
                address_line1: addressLine1 || undefined,
                city: city || undefined,
                state: state || undefined,
                postal_code: postalCode || undefined,
                country: country || undefined,
                ...(logo ? { logo } : {}),
              });
              await refreshWorkspace();
              setMessage('Business profile updated.');
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to update business.'));
            } finally {
              setLoading(false);
            }
          }}
        />
      }
    >
      <Text style={styles.title}>Edit business profile</Text>
      <Text style={styles.subtitle}>Update branding, contact details, location, and regional defaults.</Text>
      <ImagePickerButton
        label="Business logo"
        variant="card"
        valueUri={activeBusiness?.logo}
        onPicked={setLogoAsset}
        helperText="Used across OPS-Mobile and customer-facing branding."
      />
      <Input label="Legal / business name" value={businessName} onChangeText={setBusinessName} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="Business email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Primary contact" value={primaryContact} onChangeText={setPrimaryContact} />
      <Input label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" />
      <Input label="Address" value={addressLine1} onChangeText={setAddressLine1} />
      <Input label="City" value={city} onChangeText={setCity} />
      <Input label="State" value={state} onChangeText={setState} />
      <Input label="Postal code" value={postalCode} onChangeText={setPostalCode} />
      <Input label="Country" value={country} onChangeText={setCountry} />
      <SelectField label="Timezone" value={timezone} options={timezoneOptions} onChange={setTimezone} />
      <SelectField label="Currency" value={currency} options={currencyOptions} onChange={setCurrency} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginTop: -4 },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
