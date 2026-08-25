import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-orbit/i18n';
import { mobileClient } from '../../api/client';
import { uploadCustomerProfilePhoto } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileCustomerProfile } from '../../hooks/useMobileCustomerProfile';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { LanguagePicker } from '../../components/LanguagePicker';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { persistLanguagePreference } from '../../i18n';
import { useScreenInsets } from '../../theme/layout';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

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
  const { headerPaddingTop } = useScreenInsets();
  const { profile, reload: reloadCustomerProfile } = useMobileCustomerProfile(Boolean(user));
  const primary = branding?.primaryColor ?? colors.primary;

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [language, setLanguage] = useState(user?.language || 'en');
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.profile_photo ?? null);
  const [fullAddress, setFullAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setPhone(user?.phone_number ?? '');
    setLanguage(user?.language || 'en');
    if (!photoAsset) {
      setPhotoPreview(user?.profile_photo ?? null);
    }
  }, [user, photoAsset]);

  useEffect(() => {
    const address = profile?.address;
    if (!address) return;
    setFullAddress(address.full_address || address.line1 || '');
    setCity(address.city || '');
    setState(address.state || '');
    setCountry(address.country || '');
    setPostalCode(address.postal_code || '');
    setLatitude(address.latitude != null ? Number(address.latitude) : null);
    setLongitude(address.longitude != null ? Number(address.longitude) : null);
  }, [profile?.address]);

  async function onSave() {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (photoAsset && token && tenantSlug && businessCode) {
        const uploaded = await uploadCustomerProfilePhoto({
          token,
          tenantSlug,
          businessCode,
          asset: photoAsset,
        });
        setPhotoPreview(uploaded.profile_photo);
        setPhotoAsset(null);
      }

      await mobileClient.auth.patchMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim() || null,
        language,
      });
      if (tenantSlug && businessCode) {
        await mobileClient.mobile.updateCustomerProfile(
          {
            full_address: fullAddress.trim(),
            line1: fullAddress.trim(),
            city,
            state,
            country,
            postal_code: postalCode,
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
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.updateFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>{t('profile.personalInfo')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ImagePickerButton
          label={t('common.profilePhoto')}
          variant="avatar"
          valueUri={photoPreview}
          onPicked={(asset) => {
            setPhotoAsset(asset);
            setPhotoPreview(asset.uri);
          }}
          helperText={t('profile.photoHelper')}
        />
        <Input label={t('common.firstName')} value={firstName} onChangeText={setFirstName} placeholder={t('common.firstName')} />
        <Input label={t('common.lastName')} value={lastName} onChangeText={setLastName} placeholder={t('common.lastName')} />
        <Input
          label={t('common.email')}
          value={user?.email ?? ''}
          editable={false}
          placeholder={t('common.email')}
          leftIcon="mail"
        />
        <Input
          label={t('common.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('common.phone')}
          leftIcon="phone"
          keyboardType="phone-pad"
        />
        <LanguagePicker
          label={t('common.language')}
          value={language}
          onChange={setLanguage}
          primaryColor={primary}
        />
        <Text style={styles.hint}>{t('profile.languageHint')}</Text>

        <AddressLocationPicker
          value={fullAddress}
          onChangeText={setFullAddress}
          latitude={latitude}
          longitude={longitude}
          onPlaceSelected={(place) => {
            setFullAddress(place.line1 || place.formattedAddress);
            setCity(place.city || '');
            setState(place.state || '');
            setCountry(place.country || '');
            setPostalCode(place.postalCode || '');
            setLatitude(place.latitude ?? null);
            setLongitude(place.longitude ?? null);
          }}
          primaryColor={primary}
        />
        <Input label="City" value={city} onChangeText={setCity} />
        <Input label="State" value={state} onChangeText={setState} />
        <Input label="Country" value={country} onChangeText={setCountry} />
        <Input label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Button
          label={t('common.saveChanges')}
          size="lg"
          fullWidth
          loading={saving}
          primaryColor={primary}
          onPress={onSave}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: { ...typography.title, color: colors.foreground },
  content: { padding: spacing.xl, gap: spacing.lg },
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: -8 },
  error: { ...typography.caption, color: colors.destructive },
  success: { ...typography.caption, color: colors.success },
});
