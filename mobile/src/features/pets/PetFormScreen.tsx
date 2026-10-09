import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { mobileClient } from '../../api/client';
import { uploadPetPhoto } from '../../api/media';
import { DateField } from '../../components/DateField';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { ScreenHeader, StickyFooter } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing, typography } from '../../theme/tokens';
import { PET_SEX, PET_SPECIES } from './petHelpers';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PetForm'>;

export function PetFormScreen({ navigation, route }: Props) {
  const { token } = useAuth();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const toast = useToast();
  const petId = route.params?.petId;
  const isEdit = Boolean(petId);
  const primary = branding?.primaryColor ?? colors.primary;

  const [name, setName] = useState('');
  const [speciesChoice, setSpeciesChoice] = useState('Dog');
  const [speciesOther, setSpeciesOther] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('');
  const [birthday, setBirthday] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [speciesError, setSpeciesError] = useState('');

  useEffect(() => {
    if (!isEdit || !petId) return;
    void (async () => {
      try {
        const res = await mobileClient.mobile.getMyPet(petId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        const pet = res.data;
        setName(pet.name || '');
        const species = (pet.species || 'Dog').trim();
        const inList = (PET_SPECIES as readonly string[])
          .filter((item) => item !== 'Other')
          .some((item) => item.toLowerCase() === species.toLowerCase());
        setSpeciesChoice(inList ? species : 'Other');
        setSpeciesOther(inList ? '' : species);
        setBreed(pet.breed || '');
        setSex(pet.sex || '');
        setBirthday(pet.birthday || '');
        setMedicalNotes(pet.medical_notes || '');
        setPhotoUrl(pet.photo_url || '');
      } catch (err) {
        Alert.alert('Unable to load pet', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [businessCode, isEdit, petId, tenantSlug]);

  async function onSave() {
    if (!name.trim()) {
      setNameError('Give your pet a name.');
      return;
    }
    setNameError('');
    const speciesValue = speciesChoice === 'Other' ? speciesOther.trim() : speciesChoice.trim();
    if (speciesChoice === 'Other' && !speciesValue) {
      setSpeciesError('Enter the species.');
      return;
    }
    setSpeciesError('');
    setSaving(true);
    try {
      let nextPhoto = photoUrl;
      if (photoAsset && token) {
        const uploaded = await uploadPetPhoto({
          token,
          tenantSlug,
          businessCode,
          asset: photoAsset,
        });
        nextPhoto = uploaded.photo_url;
      }
      const payload = {
        name: name.trim(),
        species: speciesValue,
        breed: breed.trim(),
        sex: sex.trim(),
        birthday: birthday || null,
        photo_url: nextPhoto,
        medical_notes: medicalNotes.trim(),
      };
      if (isEdit && petId) {
        await mobileClient.mobile.patchMyPet(petId, payload, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        toast.push('Pet details saved.', 'success');
      } else {
        await mobileClient.mobile.createMyPet({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          ...payload,
        });
        toast.push('Pet added.', 'success');
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={isEdit ? 'Edit pet' : 'Add pet'} onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
          >
            <ImagePickerButton
              label="Pet photo"
              valueUri={photoAsset?.uri || photoUrl}
              onPicked={(asset) => setPhotoAsset(asset)}
              variant="avatar"
              helperText="A clear photo helps the shop recognise them."
            />
            <Input
              label="Name"
              required
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameError('');
              }}
              error={nameError}
              placeholder="Milo"
            />
            <View>
              <Text style={styles.label}>Species</Text>
              <View style={styles.chips}>
                {PET_SPECIES.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    active={speciesChoice === item}
                    primaryColor={primary}
                    onPress={() => {
                      setSpeciesChoice(item);
                      if (item !== 'Other') setSpeciesOther('');
                      setSpeciesError('');
                    }}
                  />
                ))}
              </View>
              {speciesChoice === 'Other' ? (
                <Input
                  label="Species name"
                  required
                  value={speciesOther}
                  onChangeText={(value) => {
                    setSpeciesOther(value);
                    setSpeciesError('');
                  }}
                  error={speciesError}
                  placeholder="e.g. Hamster"
                />
              ) : null}
            </View>
            <Input label="Breed" optional value={breed} onChangeText={setBreed} placeholder="Indie, Labrador…" />
            <View>
              <Text style={styles.label}>Sex</Text>
              <View style={styles.chips}>
                {PET_SEX.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    active={sex === item}
                    primaryColor={primary}
                    onPress={() => setSex(item)}
                  />
                ))}
              </View>
            </View>
            <DateField
              label="Birthday"
              value={birthday}
              onChange={setBirthday}
              allowPast
              primaryColor={primary}
              helperText="We'll send you an in-app and email reminder 5 days before, and it will also appear in Notifications."
            />
            <Input
              label="Notes"
              optional
              value={medicalNotes}
              onChangeText={setMedicalNotes}
              placeholder="Allergies, diet, temperament…"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={styles.notes}
            />
          </ScrollView>
          <StickyFooter>
            <Button
              label={isEdit ? 'Save changes' : 'Add pet'}
              icon={isEdit ? 'check' : 'plus'}
              fullWidth
              loading={saving}
              primaryColor={primary}
              onPress={() => void onSave()}
            />
          </StickyFooter>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  label: { ...typography.label, color: colors.foreground, fontWeight: '700', marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notes: { minHeight: 96, paddingTop: spacing.sm },
});
