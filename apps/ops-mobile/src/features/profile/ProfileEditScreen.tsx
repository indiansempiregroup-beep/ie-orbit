import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { uploadProfilePhoto } from '../../api/media';
import { TIMEZONES } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function ProfileEditScreen() {
  const { user, token, refreshProfile } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const client = useOpsClient();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [timezone, setTimezone] = useState(user?.timezone || 'Asia/Kolkata');
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.profile_photo ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setPhone(user?.phone_number ?? '');
    setTimezone(user?.timezone || 'Asia/Kolkata');
    if (!photoAsset) {
      setPhotoPreview(user?.profile_photo ?? null);
    }
  }, [user, photoAsset]);

  const timezoneOptions =
    timezone && !TIMEZONES.some((option) => option.value === timezone)
      ? [...TIMEZONES, { value: timezone, label: timezone }]
      : TIMEZONES;

  return (
    <FormScreen
      footer={
        <Button
          label="Save profile"
          loading={loading}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!client || !token || !tenantId || !businessId) return;
            setLoading(true);
            setError(null);
            try {
              let profilePhoto = user?.profile_photo ?? undefined;
              if (photoAsset) {
                const uploaded = await uploadProfilePhoto({
                  token,
                  tenantId,
                  businessId,
                  asset: photoAsset,
                  userName: `${firstName} ${lastName}`.trim() || user?.email || 'User',
                });
                const uploadedUrl = uploaded.public_url || uploaded.private_url;
                if (!uploadedUrl) {
                  throw new Error('Photo uploaded but no URL was returned. Please try again.');
                }
                profilePhoto = uploadedUrl;
              }

              await client.auth.patchMe({
                first_name: firstName,
                last_name: lastName,
                phone_number: phone,
                timezone,
                ...(profilePhoto && !profilePhoto.startsWith('file:')
                  ? { profile_photo: profilePhoto }
                  : {}),
              });
              await refreshProfile();
              setPhotoAsset(null);
              setPhotoPreview(profilePhoto && !profilePhoto.startsWith('file:') ? profilePhoto : null);
              setMessage('Profile updated.');
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to update profile.'));
            } finally {
              setLoading(false);
            }
          }}
        />
      }
    >
      <Text style={styles.title}>Edit profile</Text>
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
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <SelectField label="Timezone" value={timezone} options={timezoneOptions} onChange={setTimezone} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
