import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useCustomers } from '../../hooks/useOpsData';
import { uploadPetImage } from '../../api/media';
import { FormScreen } from '../../components/FormScreen';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { DateField } from '../../components/DateField';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { ScreenState } from '../../components/ScreenState';
import { colors } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPet } from '@ie-orbit/sdk';

const SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
const SEX_OPTIONS = ['Male', 'Female', 'Unknown'];

type FormState = {
  customerId: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  birthday: string;
  photoUrl: string;
  medicalNotes: string;
};

const EMPTY: FormState = {
  customerId: '',
  name: '',
  species: 'Dog',
  breed: '',
  sex: '',
  birthday: '',
  photoUrl: '',
  medicalNotes: '',
};

function petToForm(pet: ShopPet): FormState {
  return {
    customerId: pet.customer,
    name: pet.name,
    species: pet.species || 'Dog',
    breed: pet.breed || '',
    sex: pet.sex || '',
    birthday: pet.birthday || '',
    photoUrl: pet.photo_url || '',
    medicalNotes: pet.medical_notes || '',
  };
}

export function ShopPetFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopPetForm'>>();
  const client = useOpsClient();
  const { token } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const { customers, reload: refreshCustomers } = useCustomers();
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
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit || !client || !petId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getPet(petId);
        if (!cancelled) {
          const next = petToForm(response.data);
          setForm(next);
          setPhotoPreview(next.photoUrl || null);
          setPhotoAsset(null);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load pet');
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, isEdit, petId]);

  useEffect(() => {
    const selectId = route.params?.selectCustomerId;
    if (selectId) {
      setForm((current) => ({ ...current, customerId: selectId }));
    }
  }, [route.params?.selectCustomerId]);

  useEffect(() => {
    void refreshCustomers();
  }, [refreshCustomers, route.params?.selectCustomerId]);

  const customerOptions = useMemo(() => {
    const options = (customers ?? []).map((customer) => ({
      value: customer.id,
      label:
        customer.full_name ||
        customer.display_name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
        customer.email ||
        customer.phone_number ||
        customer.id,
    }));
    if (form.customerId && !options.some((option) => option.value === form.customerId)) {
      options.push({ value: form.customerId, label: 'Selected customer' });
    }
    return options;
  }, [customers, form.customerId]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!client || !businessId) return;
    if (!form.customerId) {
      setMessage('Select a customer (owner).');
      return;
    }
    if (!form.name.trim()) {
      setMessage('Pet name is required.');
      return;
    }
    if (form.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(form.birthday.trim())) {
      setMessage('Birthday must be YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let photoUrl = form.photoUrl.trim();
      if (photoAsset) {
        if (!token || !tenantId) throw new Error('Workspace is not ready. Please sign in again.');
        const uploaded = await uploadPetImage({
          token,
          tenantId,
          businessId,
          asset: photoAsset,
          petName: form.name.trim() || 'Pet',
        });
        photoUrl = uploaded.public_url || uploaded.private_url || '';
        if (!photoUrl) throw new Error('Photo uploaded but no URL was returned.');
      }

      const payload = {
        business_id: businessId,
        customer_id: form.customerId,
        name: form.name.trim(),
        species: form.species.trim(),
        breed: form.breed.trim(),
        sex: form.sex.trim(),
        birthday: form.birthday.trim() || null,
        photo_url: photoUrl,
        medical_notes: form.medicalNotes.trim(),
      };
      if (isEdit && petId) {
        const response = await client.shop.patchPet(petId, payload);
        navigation.replace('ShopPetDetail', { petId: response.data.id });
      } else {
        const response = await client.shop.createPet(payload);
        navigation.replace('ShopPetDetail', { petId: response.data.id });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save pet');
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
            label={saving ? 'Saving…' : isEdit ? 'Update pet' : 'Save pet'}
            loading={saving}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
          {isEdit ? (
            <Button
              label="Delete pet"
              variant="destructive"
              fullWidth
              onPress={() => {
                Alert.alert('Delete pet?', 'This removes the pet profile.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      if (!client || !petId) return;
                      void (async () => {
                        try {
                          await client.shop.deletePet(petId);
                          navigation.navigate('ShopPets');
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : 'Unable to delete');
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
      <Text style={styles.sectionTitle}>Owner</Text>
      <View style={styles.customerRow}>
        <View style={styles.customerField}>
          <SelectField
            label="Customer"
            value={form.customerId}
            options={customerOptions}
            onChange={(value) => setField('customerId', value)}
            searchable
            placeholder="Select customer"
          />
        </View>
        <Pressable
          style={styles.sideAddBtn}
          onPress={() => navigation.navigate('CustomerForm', { returnTo: 'pets' })}
          accessibilityLabel="Add customer"
        >
          <Feather name="user-plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <ImagePickerButton
        label="Pet photo"
        variant="card"
        valueUri={photoPreview || form.photoUrl || null}
        onPicked={(asset) => {
          setPhotoAsset(asset);
          setPhotoPreview(asset.uri);
        }}
        helperText="Shown on the pet profile. Use camera or gallery."
      />

      <Text style={styles.sectionTitle}>Pet details</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(value) => setField('name', value)}
        placeholder="Pet name"
        placeholderTextColor={colors.mutedForeground}
      />
      <Text style={styles.label}>Species</Text>
      <View style={styles.chipWrap}>
        {SPECIES.map((value) => (
          <Pressable
            key={value}
            style={[styles.chip, form.species === value && styles.chipActive]}
            onPress={() => setField('species', value)}
          >
            <Text style={[styles.chipText, form.species === value && styles.chipTextActive]}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={form.breed}
        onChangeText={(value) => setField('breed', value)}
        placeholder="Breed"
        placeholderTextColor={colors.mutedForeground}
      />
      <Text style={styles.label}>Sex</Text>
      <View style={styles.chipWrap}>
        {SEX_OPTIONS.map((value) => (
          <Pressable
            key={value}
            style={[styles.chip, form.sex === value && styles.chipActive]}
            onPress={() => setField('sex', value)}
          >
            <Text style={[styles.chipText, form.sex === value && styles.chipTextActive]}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <DateField
        label="Birthday"
        value={form.birthday}
        onChange={(value) => setField('birthday', value)}
        allowPast
        allowFuture={false}
        helperText="Owners get an in-app + email reminder 5 days before the birthday. Business owners and managers also get an alert so they can open the pet and send an extra message."
      />
      <TextInput
        style={[styles.input, styles.notes]}
        value={form.medicalNotes}
        onChangeText={(value) => setField('medicalNotes', value)}
        placeholder="Medical notes / allergies / diet"
        multiline
        placeholderTextColor={colors.mutedForeground}
      />

      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontWeight: '700',
    color: colors.foreground,
  },
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 90, textAlignVertical: 'top' },
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
