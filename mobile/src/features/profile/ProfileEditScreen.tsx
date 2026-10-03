import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-orbit/i18n';
import { mobileClient } from '../../api/client';
import { uploadCustomerProfilePhoto } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileCustomerProfile } from '../../hooks/useMobileCustomerProfile';
import { useToast } from '../../contexts/ToastContext';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { LanguagePicker } from '../../components/LanguagePicker';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { persistLanguagePreference } from '../../i18n';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { indianMobileError, requiredMessage } from '../../utils/formValidation';

function roundCoord(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function ProfileEditScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user, token, refreshProfile } = useAuth();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { profile, reload: reloadCustomerProfile } = useMobileCustomerProfile(Boolean(user));
  const toast = useToast();
  const primary = branding?.primaryColor ?? colors.primary;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState(user?.language || 'en');
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [fullAddress, setFullAddress] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setLanguage(user?.language || 'en');
  }, [user?.language]);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setPhone(profile.phone_number ?? '');
    // Keep a newly picked local/uploaded preview until the server profile catches up.
    if (!photoAsset && !photoUploading && profile.profile_photo) {
      setPhotoPreview(profile.profile_photo);
    }
  }, [profile, photoAsset, photoUploading]);

  useEffect(() => {
    const address = profile?.address;
    if (!address) return;
    setFullAddress(address.full_address || address.line1 || '');
    setLine2(address.line2 || '');
    setCity(address.city || '');
    setState(address.state || '');
    setCountry(address.country || '');
    setPostalCode(address.postal_code || '');
    setLatitude(address.latitude != null ? Number(address.latitude) : null);
    setLongitude(address.longitude != null ? Number(address.longitude) : null);
  }, [profile?.address]);

  async function uploadPhoto(asset: ImagePickerAsset) {
    if (!token || !tenantSlug || !businessCode) {
      throw new Error('Unable to upload photo. Sign in again and retry.');
    }
    setPhotoUploading(true);
    setPhotoUploadProgress(0);
    try {
      const uploaded = await uploadCustomerProfilePhoto({
        token,
        tenantSlug,
        businessCode,
        asset,
        onProgress: setPhotoUploadProgress,
      });
      setPhotoPreview(uploaded.profile_photo);
      setPhotoAsset(null);
      await reloadCustomerProfile();
    } finally {
      setPhotoUploading(false);
      setPhotoUploadProgress(null);
    }
  }

  async function onPickPhoto(asset: ImagePickerAsset) {
    setPhotoAsset(asset);
    setPhotoPreview(asset.uri);
    setError('');
    try {
      await uploadPhoto(asset);
    } catch (err) {
      // Keep local preview + pending asset so Save can retry the upload.
      setError(getApiErrorMessage(err, 'Photo upload failed. You can retry by saving.'));
    }
  }

  async function onSave() {
    setError('');
    setSuccess('');
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = requiredMessage('First name');
    if (!lastName.trim()) nextErrors.lastName = requiredMessage('Last name');
    if (!user?.email?.trim()) nextErrors.email = requiredMessage('Email');
    const phoneError = indianMobileError(phone, true);
    if (phoneError) nextErrors.phone = phoneError;
    if (!language.trim()) nextErrors.language = requiredMessage('Language');
    if (!fullAddress.trim()) nextErrors.address = 'Search for your address or drop a pin on the map.';
    if (!line2.trim()) nextErrors.line2 = requiredMessage('Flat, floor, building or landmark');
    if (!city.trim()) nextErrors.city = requiredMessage('City');
    if (!state.trim()) nextErrors.state = requiredMessage('State');
    if (!country.trim()) nextErrors.country = requiredMessage('Country');
    if (!postalCode.trim()) nextErrors.postalCode = requiredMessage('Postal code');
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }
    if (photoUploading) {
      setError('Please wait for the photo upload to finish.');
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      if (photoAsset) {
        await uploadPhoto(photoAsset);
      }

      await mobileClient.auth.patchMe({ language });
      if (tenantSlug && businessCode) {
        await mobileClient.mobile.updateCustomerProfile(
          {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone_number: phone.replace(/[\s-]/g, '').trim(),
            full_address: fullAddress.trim(),
            line1: fullAddress.trim(),
            line2: line2.trim(),
            city: city.trim(),
            state: state.trim(),
            country: country.trim(),
            postal_code: postalCode.trim(),
            latitude: roundCoord(latitude),
            longitude: roundCoord(longitude),
          },
          { tenant_slug: tenantSlug, business_code: businessCode },
        );
        await reloadCustomerProfile();
      }
      setActiveIntlLocale(language);
      await persistLanguagePreference(language);
      await applyAppLanguage(language);
      await refreshProfile();
      setSuccess(t('profile.updated'));
      toast.push(t('profile.updated'), 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.updateFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ProfileMenuScreen
        title={t('profile.personalInfo')}
        onBack={() => navigation.goBack()}
        primaryColor={primary}
        footer={
          <Button
            label={t('common.saveChanges')}
            icon="check"
            size="lg"
            fullWidth
            loading={saving || photoUploading}
            disabled={photoUploading}
            primaryColor={primary}
            onPress={() => void onSave()}
          />
        }
      >
        <ImagePickerButton
          label={t('common.profilePhoto')}
          variant="avatar"
          valueUri={photoPreview}
          uploading={photoUploading}
          uploadProgress={photoUploadProgress}
          onPicked={(asset) => {
            void onPickPhoto(asset);
          }}
          helperText={t('profile.photoHelper')}
        />
        <Text style={styles.hint}>{t('profile.sharedAccountNote')}</Text>
        <Input
          label={t('common.firstName')}
          required
          value={firstName}
          onChangeText={(value) => {
            setFirstName(value);
            setFieldErrors((current) => ({ ...current, firstName: '' }));
          }}
          error={fieldErrors.firstName}
          placeholder={t('common.firstName')}
        />
        <Input
          label={t('common.lastName')}
          required
          value={lastName}
          onChangeText={(value) => {
            setLastName(value);
            setFieldErrors((current) => ({ ...current, lastName: '' }));
          }}
          error={fieldErrors.lastName}
          placeholder={t('common.lastName')}
        />
        <Input
          label={t('common.email')}
          required
          value={user?.email ?? ''}
          editable={false}
          placeholder={t('common.email')}
          leftIcon="mail"
          error={fieldErrors.email}
        />
        <Input
          label={t('common.phone')}
          required
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setFieldErrors((current) => ({ ...current, phone: '' }));
          }}
          error={fieldErrors.phone}
          placeholder={t('common.phone')}
          leftIcon="phone"
          keyboardType="phone-pad"
        />
        <LanguagePicker
          label={`${t('common.language')} *`}
          value={language}
          onChange={(value) => {
            setLanguage(value);
            setFieldErrors((current) => ({ ...current, language: '' }));
          }}
          primaryColor={primary}
        />
        {fieldErrors.language ? <Text style={styles.error}>{fieldErrors.language}</Text> : null}
        <Text style={styles.hint}>{t('profile.languageHint')}</Text>

        <AddressLocationPicker
          required
          fieldError={fieldErrors.address}
          value={fullAddress}
          onChangeText={(value) => {
            setFullAddress(value);
            setFieldErrors((current) => ({ ...current, address: '' }));
          }}
          latitude={latitude}
          longitude={longitude}
          onPlaceSelected={(place) => {
            const cleared =
              !place.line1 &&
              !place.formattedAddress &&
              place.latitude == null &&
              place.longitude == null;
            setFullAddress(place.line1 || place.formattedAddress);
            setLine2((current) => (cleared ? '' : current));
            setCity(place.city || '');
            setState(place.state || '');
            setCountry(place.country || '');
            setPostalCode(place.postalCode || '');
            setLatitude(place.latitude ?? null);
            setLongitude(place.longitude ?? null);
            setFieldErrors((current) => ({
              ...current,
              address: '',
              city: '',
              state: '',
              country: '',
              postalCode: '',
            }));
          }}
          primaryColor={primary}
        />
        <Input
          label="Flat, floor, building or landmark"
          required
          hint="Add door-level detail here — Google search only fills the street / area."
          placeholder="Flat 302, B wing, near City Mall"
          value={line2}
          onChangeText={(value) => {
            setLine2(value);
            setFieldErrors((current) => ({ ...current, line2: '' }));
          }}
          error={fieldErrors.line2}
        />
        <Input
          label="City"
          required
          value={city}
          onChangeText={(value) => {
            setCity(value);
            setFieldErrors((current) => ({ ...current, city: '' }));
          }}
          error={fieldErrors.city}
          editable={!(latitude != null && longitude != null)}
        />
        <Input
          label="State"
          required
          value={state}
          onChangeText={(value) => {
            setState(value);
            setFieldErrors((current) => ({ ...current, state: '' }));
          }}
          error={fieldErrors.state}
          editable={!(latitude != null && longitude != null)}
        />
        <Input
          label="Country"
          required
          value={country}
          onChangeText={(value) => {
            setCountry(value);
            setFieldErrors((current) => ({ ...current, country: '' }));
          }}
          error={fieldErrors.country}
          editable={!(latitude != null && longitude != null)}
        />
        <Input
          label="Postal code"
          required
          value={postalCode}
          onChangeText={(value) => {
            setPostalCode(value);
            setFieldErrors((current) => ({ ...current, postalCode: '' }));
          }}
          error={fieldErrors.postalCode}
          keyboardType="number-pad"
          editable={!(latitude != null && longitude != null)}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
      </ProfileMenuScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: -8 },
  error: { ...typography.caption, color: colors.destructive },
  success: { ...typography.caption, color: colors.success },
});
