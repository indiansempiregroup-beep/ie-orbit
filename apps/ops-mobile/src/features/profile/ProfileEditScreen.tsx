import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { applyAppLanguage, setActiveIntlLocale } from '@ie-orbit/i18n';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { uploadProfilePhoto } from '../../api/media';
import { LANGUAGES, TIMEZONES } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { persistLanguagePreference } from '../../i18n';
import { colors, fonts, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function ProfileEditScreen() {
  const { t } = useTranslation();
  const { user, token, refreshProfile } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const client = useOpsClient();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [language, setLanguage] = useState(user?.language || 'en');
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
    setLanguage(user?.language || 'en');
    setTimezone(user?.timezone || 'Asia/Kolkata');
    if (!photoAsset) {
      setPhotoPreview(user?.profile_photo ?? null);
    }
  }, [user, photoAsset]);

  const timezoneOptions =
    timezone && !TIMEZONES.some((option) => option.value === timezone)
      ? [...TIMEZONES, { value: timezone, label: timezone }]
      : TIMEZONES;

  const languageOptions =
    language && !LANGUAGES.some((option) => option.value === language)
      ? [...LANGUAGES, { value: language, label: language }]
      : LANGUAGES;

  return (
    <FormScreen
      footer={
        <Button
          label={t('common.save')}
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
                language,
                timezone,
                ...(profilePhoto && !profilePhoto.startsWith('file:')
                  ? { profile_photo: profilePhoto }
                  : {}),
              });
              setActiveIntlLocale(language);
              await persistLanguagePreference(language);
              await applyAppLanguage(language);
              await refreshProfile();
              setPhotoAsset(null);
              setPhotoPreview(profilePhoto && !profilePhoto.startsWith('file:') ? profilePhoto : null);
              setMessage(t('profile.updated'));
            } catch (err) {
              setError(getApiErrorMessage(err, t('profile.updateFailed')));
            } finally {
              setLoading(false);
            }
          }}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={styles.title}>{t('profile.editTitle')}</Text>
        <Text style={styles.subtitle}>{t('profile.editSubtitle')}</Text>
      </View>

      <FormSection title={t('profile.identity')}>
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
        <Input label={t('common.firstName')} value={firstName} onChangeText={setFirstName} />
        <Input label={t('common.lastName')} value={lastName} onChangeText={setLastName} />
      </FormSection>

      <FormSection title={t('profile.contactRegion')}>
        <Input label={t('common.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <SelectField
          label={t('common.language')}
          value={language}
          options={languageOptions}
          onChange={setLanguage}
        />
        <Text style={styles.hint}>{t('profile.languageHint')}</Text>
        <SelectField label={t('common.timezone')} value={timezone} options={timezoneOptions} onChange={setTimezone} />
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
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: -4 },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
