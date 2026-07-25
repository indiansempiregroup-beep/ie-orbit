import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { mobileClient } from '../../api/client';
import { uploadCustomerProfilePhoto } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileCustomerProfile } from '../../hooks/useMobileCustomerProfile';
import { AddressMapPicker } from '../../components/AddressMapPicker';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

function roundCoord(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function ProfileEditScreen() {
  const navigation = useNavigation();
  const { user, token, refreshProfile } = useAuth();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { profile, reload: reloadCustomerProfile } = useMobileCustomerProfile(Boolean(user));
  const primary = branding?.primaryColor ?? colors.primary;

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.profile_photo ?? null);
  const [fullAddress, setFullAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setPhone(user?.phone_number ?? '');
    if (!photoAsset) {
      setPhotoPreview(user?.profile_photo ?? null);
    }
  }, [user, photoAsset]);

  useEffect(() => {
    const address = profile?.address;
    if (!address) return;
    setFullAddress(address.full_address || address.line1 || '');
    setLatitude(address.latitude ?? null);
    setLongitude(address.longitude ?? null);
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
      });
      if (tenantSlug && businessCode) {
        await mobileClient.mobile.updateCustomerProfile(
          {
            full_address: fullAddress.trim(),
            latitude: roundCoord(latitude),
            longitude: roundCoord(longitude),
          },
          { tenant_slug: tenantSlug, business_code: businessCode },
        );
        await reloadCustomerProfile();
      }
      await refreshProfile();
      setSuccess('Profile updated.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to update profile.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Personal Information</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ImagePickerButton
          label="Profile photo"
          variant="avatar"
          valueUri={photoPreview}
          onPicked={(asset) => {
            setPhotoAsset(asset);
            setPhotoPreview(asset.uri);
          }}
          helperText="Tap to take a photo or choose from your gallery."
        />
        <Input label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Input label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Input
          label="Email"
          value={user?.email ?? ''}
          editable={false}
          placeholder="Email"
          leftIcon="mail"
        />
        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          leftIcon="phone"
          keyboardType="phone-pad"
        />

        <AddressMapPicker
          value={fullAddress}
          onChangeText={setFullAddress}
          latitude={latitude}
          longitude={longitude}
          onLocationChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
          primaryColor={primary}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Button label="Save changes" size="lg" fullWidth loading={saving} primaryColor={primary} onPress={onSave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 56,
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
  error: { ...typography.caption, color: colors.destructive },
  success: { ...typography.caption, color: colors.success },
});
