import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { ShopCustomerPickerField } from './ShopPickers';
import { uploadPetImage } from '../../api/media';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { DateField } from '../../components/DateField';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { FieldLabel } from '../../components/ui/FieldLabel';
import { colors } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPet } from '@ie-orbit/sdk';

const FALLBACK_SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit'];
const SEX_OPTIONS = ['Male', 'Female', 'Unknown'];

function speciesLabel(value: string, t: TFunction): string {
  return t(`shop.pets.speciesList.${value.toLowerCase()}`, { defaultValue: value });
}

function sexLabel(value: string, t: TFunction): string {
  return t(`shop.pets.sexList.${value.toLowerCase()}`, { defaultValue: value });
}

type FormState = {
  customerId: string;
  name: string;
  speciesChoice: string;
  speciesOther: string;
  breed: string;
  sex: string;
  birthday: string;
  photoUrl: string;
  medicalNotes: string;
};

const EMPTY: FormState = {
  customerId: '',
  name: '',
  speciesChoice: 'Dog',
  speciesOther: '',
  breed: '',
  sex: '',
  birthday: '',
  photoUrl: '',
  medicalNotes: '',
};

function petToForm(pet: ShopPet, masterLabels: string[]): FormState {
  const species = (pet.species || 'Dog').trim();
  const inMaster = masterLabels.some((label) => label.toLowerCase() === species.toLowerCase());
  return {
    customerId: pet.customer,
    name: pet.name,
    speciesChoice: inMaster ? species : 'Other',
    speciesOther: inMaster ? '' : species,
    breed: pet.breed || '',
    sex: pet.sex || '',
    birthday: pet.birthday || '',
    photoUrl: pet.photo_url || '',
    medicalNotes: pet.medical_notes || '',
  };
}

export function ShopPetFormScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopPetForm'>>();
  const client = useOpsClient();
  const { token } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const toast = useToast();
  const petId = route.params?.petId;
  const isEdit = Boolean(petId);

  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    customerId: route.params?.selectCustomerId || '',
  });
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!isEdit);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>(FALLBACK_SPECIES);

  useEffect(() => {
    if (!client || !businessId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.listMasterRecords('pet_species', { business_id: businessId });
        const labels = (response.data.items ?? [])
          .filter((row) => row.is_active)
          .map((row) => row.label)
          .filter(Boolean);
        if (!cancelled && labels.length) setSpeciesOptions(labels);
      } catch {
        // Keep fallback species list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, client]);

  useEffect(() => {
    if (!isEdit || !client || !petId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getPet(petId);
        if (!cancelled) {
          const next = petToForm(response.data, speciesOptions);
          setForm(next);
          setPhotoPreview(next.photoUrl || null);
          setPhotoAsset(null);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : t('opsApp.shop.pets.loadPetFailed'));
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, isEdit, petId, speciesOptions, t]);

  useEffect(() => {
    const selectId = route.params?.selectCustomerId;
    if (selectId) {
      setForm((current) => ({ ...current, customerId: selectId }));
    }
  }, [route.params?.selectCustomerId]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!client || !businessId) return;
    if (!form.customerId) {
      setFieldErrors({ customerId: t('opsApp.shop.pets.errSelectOwner') });
      setMessage(t('opsApp.shop.pets.errSelectOwner'));
      return;
    }
    if (!form.name.trim()) {
      setFieldErrors({ name: t('opsApp.shop.pets.errPetName') });
      setMessage(t('opsApp.shop.pets.errPetName'));
      return;
    }
    const speciesValue =
      form.speciesChoice === 'Other' ? form.speciesOther.trim() : form.speciesChoice.trim();
    if (form.speciesChoice === 'Other' && !speciesValue) {
      setFieldErrors({ speciesOther: t('shop.pets.errEnterSpecies') });
      setMessage(t('shop.pets.errEnterSpecies'));
      return;
    }
    if (!speciesValue) {
      setFieldErrors({ speciesChoice: t('shop.pets.errSelectSpecies') });
      setMessage(t('shop.pets.errSelectSpecies'));
      return;
    }
    setFieldErrors({});
    if (form.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(form.birthday.trim())) {
      setMessage(t('opsApp.shop.pets.errBirthdayFormat'));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let photoUrl = form.photoUrl.trim();
      if (photoAsset) {
        if (!token || !tenantId) throw new Error(t('opsApp.shop.productAdd.workspaceNotReady'));
        const uploaded = await uploadPetImage({
          token,
          tenantId,
          businessId,
          asset: photoAsset,
          petName: form.name.trim() || t('shop.pets.defaultPet'),
        });
        photoUrl = uploaded.public_url || uploaded.private_url || '';
        if (!photoUrl) throw new Error(t('opsApp.shop.invoiceScan.noPhotoUrlReturned'));
      }

      const payload = {
        business_id: businessId,
        customer_id: form.customerId,
        name: form.name.trim(),
        species: speciesValue,
        breed: form.breed.trim(),
        sex: form.sex.trim(),
        birthday: form.birthday.trim() || null,
        photo_url: photoUrl,
        medical_notes: form.medicalNotes.trim(),
      };
      if (isEdit && petId) {
        const response = await client.shop.patchPet(petId, payload);
        toast.push(t('shop.pets.toastSaved'), 'success');
        navigation.replace('ShopPetDetail', { petId: response.data.id });
      } else {
        const response = await client.shop.createPet(payload);
        toast.push(t('shop.pets.toastAdded'), 'success');
        navigation.replace('ShopPetDetail', { petId: response.data.id });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('shop.pets.errSave'));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <ScreenState loading />;
  }

  return (
    <FormScreen
      footer={
        <>
          <Button
            label={saving ? t('common.saving') : isEdit ? t('shop.pets.updatePet') : t('shop.pets.savePet')}
            icon="save"
            loading={saving}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
          {isEdit ? (
            <Button
              label={t('shop.pets.deletePet')}
              variant="destructive"
              fullWidth
              onPress={() => {
                Alert.alert(t('opsApp.shop.pets.deleteTitle'), t('opsApp.shop.pets.deleteMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('opsApp.shop.common.delete'),
                    style: 'destructive',
                    onPress: () => {
                      if (!client || !petId) return;
                      void (async () => {
                        try {
                          await client.shop.deletePet(petId);
                          navigation.navigate('ShopPets');
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : t('shop.pets.errRemove'));
                        }
                      })();
                    },
                  },
                ]);
              }}
            />
          ) : null}
        </>
      }
    >
      <FormHero
        icon="heart"
        title={isEdit ? t('shop.pets.editPet') : t('shop.pets.addPet')}
        subtitle={t('opsApp.shop.pets.heroSubtitle')}
      />

      <FormSection title={t('opsApp.shop.pets.owner')}>
        <View style={styles.customerRow}>
          <View style={styles.customerField}>
            <ShopCustomerPickerField
              label={t('shop.pets.customer')}
              required
              value={form.customerId}
              onChange={(value) => {
                setField('customerId', value);
                setFieldErrors((current) => ({ ...current, customerId: '' }));
              }}
              placeholder={t('shop.pets.selectCustomer')}
              error={fieldErrors.customerId}
            />
          </View>
          <Pressable
            style={styles.sideAddBtn}
            onPress={() => navigation.navigate('CustomerForm', { returnTo: 'pets' })}
            accessibilityLabel={t('opsApp.shop.pets.addCustomer')}
          >
            <Feather name="user-plus" size={20} color="#fff" />
          </Pressable>
        </View>
      </FormSection>

      <FormSection title={t('opsApp.shop.pets.petPhotoSection')}>
        <ImagePickerButton
          label={t('opsApp.shop.pets.petPhotoSection')}
          optional
          variant="card"
          valueUri={photoPreview || form.photoUrl || null}
          onPicked={(asset) => {
            setPhotoAsset(asset);
            setPhotoPreview(asset.uri);
          }}
          helperText={t('opsApp.shop.pets.photoHelper')}
        />
      </FormSection>

      <FormSection title={t('opsApp.shop.pets.petDetails')}>
        <Input
          label={t('shop.pets.petName')}
          required
          value={form.name}
          onChangeText={(value) => {
            setField('name', value);
            setFieldErrors((current) => ({ ...current, name: '' }));
          }}
          error={fieldErrors.name}
        />
        <FieldLabel label={t('shop.pets.species')} required />
        <View style={styles.chipWrap}>
          {[...speciesOptions, 'Other'].map((value) => (
            <Pressable
              key={value}
              style={[styles.chip, form.speciesChoice === value && styles.chipActive]}
              onPress={() => {
                setField('speciesChoice', value);
                if (value !== 'Other') setField('speciesOther', '');
                setFieldErrors((current) => ({ ...current, speciesOther: '', speciesChoice: '' }));
              }}
            >
              <Text style={[styles.chipText, form.speciesChoice === value && styles.chipTextActive]}>{speciesLabel(value, t)}</Text>
            </Pressable>
          ))}
        </View>
        {form.speciesChoice === 'Other' ? (
          <Input
            label={t('shop.pets.speciesName')}
            required
            value={form.speciesOther}
            onChangeText={(value) => {
              setField('speciesOther', value);
              setFieldErrors((current) => ({ ...current, speciesOther: '' }));
            }}
            error={fieldErrors.speciesOther}
            placeholder={t('shop.pets.speciesPlaceholder')}
          />
        ) : null}
        <Input label={t('shop.pets.breed')} optional value={form.breed} onChangeText={(value) => setField('breed', value)} />
        <FieldLabel label={t('shop.pets.sex')} optional />
        <View style={styles.chipWrap}>
          {SEX_OPTIONS.map((value) => (
            <Pressable
              key={value}
              style={[styles.chip, form.sex === value && styles.chipActive]}
              onPress={() => setField('sex', value)}
            >
              <Text style={[styles.chipText, form.sex === value && styles.chipTextActive]}>{sexLabel(value, t)}</Text>
            </Pressable>
          ))}
        </View>
        <DateField
          label={t('shop.pets.birthday')}
          optional
          value={form.birthday}
          onChange={(value) => setField('birthday', value)}
          allowPast
          allowFuture={false}
          helperText={t('opsApp.shop.pets.birthdayHelper')}
        />
        <Input
          label={t('opsApp.shop.pets.careNotes')}
          optional
          value={form.medicalNotes}
          onChangeText={(value) => setField('medicalNotes', value)}
          placeholder={t('opsApp.shop.pets.careNotesPlaceholder')}
          multiline
        />
      </FormSection>

      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customerField: { flex: 1 },
  sideAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  label: { color: colors.foreground, fontWeight: '600', marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.foreground, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  meta: { color: colors.mutedForeground },
});
