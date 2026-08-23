import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { uploadBrandingLogo } from '../../api/media';
import { CURRENCIES, TIMEZONES } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, fonts, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function BusinessEditScreen() {
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currency, setCurrency] = useState('INR');
  const [gstTaxNumber, setGstTaxNumber] = useState('');
  const [logoAsset, setLogoAsset] = useState<ImagePickerAsset | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [razorpayStatusLabel, setRazorpayStatusLabel] = useState('Not connected');
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
    setLatitude(activeBusiness.latitude != null ? Number(activeBusiness.latitude) : null);
    setLongitude(activeBusiness.longitude != null ? Number(activeBusiness.longitude) : null);
    setTimezone(activeBusiness.timezone || 'Asia/Kolkata');
    setCurrency(activeBusiness.currency || 'INR');
    setGstTaxNumber((activeBusiness as { gst_tax_number?: string }).gst_tax_number || '');
  }, [activeBusiness]);

  useEffect(() => {
    if (!activeBusiness || logoAsset) return;
    setLogoPreview(activeBusiness.logo || null);
  }, [activeBusiness, logoAsset]);

  useEffect(() => {
    if (!client || !businessId) return;
    void client.shop
      .getMerchantPaymentSettings({ business_id: businessId })
      .then((response) => {
        setRazorpayStatusLabel(
          response.data.can_accept_payments
            ? 'Payments live'
            : response.data.connected
              ? 'Connected but paused'
              : 'Not connected',
        );
      })
      .catch(() => {
        setRazorpayStatusLabel('Not connected');
      });
  }, [businessId, client]);

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
                gst_tax_number: gstTaxNumber.trim().toUpperCase(),
                primary_contact: primaryContact || undefined,
                website: website || undefined,
                address_line1: addressLine1 || undefined,
                city: city || undefined,
                state: state || undefined,
                postal_code: postalCode || undefined,
                country: country || undefined,
                latitude,
                longitude,
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
      <View style={styles.intro}>
        <Text style={styles.title}>Edit business</Text>
        <Text style={styles.subtitle}>Branding, contact, location, and regional defaults.</Text>
      </View>

      <FormSection title="Branding">
        <ImagePickerButton
          label="Business logo"
          variant="card"
          valueUri={logoPreview || activeBusiness?.logo}
          onPicked={(asset) => {
            setLogoAsset(asset);
            setLogoPreview(asset.uri);
          }}
          helperText="Shown in OPS-Mobile and customer-facing branding."
        />
        <Input label="Legal / business name" value={businessName} onChangeText={setBusinessName} />
        <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      </FormSection>

      <FormSection title="Contact">
        <Input
          label="Business email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input label="Primary contact" value={primaryContact} onChangeText={setPrimaryContact} />
        <Input label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" />
      </FormSection>

      <FormSection title="Location">
        <AddressLocationPicker
          value={addressLine1}
          latitude={latitude}
          longitude={longitude}
          onChangeText={setAddressLine1}
          onPlaceSelected={(place) => {
            setAddressLine1(place.line1 || place.formattedAddress);
            setCity(place.city || '');
            setState(place.state || '');
            setCountry(place.country || '');
            setPostalCode(place.postalCode || '');
            setLatitude(place.latitude ?? null);
            setLongitude(place.longitude ?? null);
          }}
        />
        <Input label="City" value={city} onChangeText={setCity} />
        <Input label="State" value={state} onChangeText={setState} />
        <Input label="Postal code" value={postalCode} onChangeText={setPostalCode} />
        <Input label="Country" value={country} onChangeText={setCountry} />
      </FormSection>

      <FormSection title="Tax & GST">
        <Input
          label="GSTIN"
          value={gstTaxNumber}
          onChangeText={setGstTaxNumber}
          autoCapitalize="characters"
          placeholder="22AAAAA0000A1Z5"
          hint="Business GST identification number used on invoices and e-invoicing."
        />
      </FormSection>

      <FormSection title="Shop payments">
        <View style={styles.paymentStatus}>
          <Text style={styles.paymentStatusTitle}>Razorpay · {razorpayStatusLabel}</Text>
          <Text style={styles.paymentStatusHint}>
            Razorpay keys, UPI ID and payment QR now live in Settings → Payments.
          </Text>
        </View>
        <Button
          label="Open payment settings"
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('PaymentSettings')}
        />
      </FormSection>

      <FormSection title="Regional">
        <SelectField label="Timezone" value={timezone} options={timezoneOptions} onChange={setTimezone} />
        <SelectField label="Currency" value={currency} options={currencyOptions} onChange={setCurrency} />
      </FormSection>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
  paymentStatus: { gap: 4, padding: 14, borderRadius: 14, backgroundColor: colors.muted },
  paymentStatusTitle: { ...typography.body, fontFamily: fonts.bodyBold, color: colors.foreground },
  paymentStatusHint: { ...typography.caption, color: colors.mutedForeground },
});
