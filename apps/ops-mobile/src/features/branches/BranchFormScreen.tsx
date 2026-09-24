import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Branch } from '@ie-orbit/sdk';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { FieldRow } from '../../components/ui/FieldRow';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../contexts/ToastContext';
import { useBranches, useBranchMutations } from '../../hooks/useOpsExtended';
import { colors, radius, spacing } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchForm'>;

const emptyForm = {
  name: '',
  address: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  phoneNumber: '',
};

type FormState = typeof emptyForm;

function formFromBranch(branch: Branch): FormState {
  return {
    name: branch.display_name || branch.branch_name || '',
    address: [branch.address_line1, branch.city, branch.state, branch.country]
      .filter(Boolean)
      .join(', '),
    addressLine1: branch.address_line1 ?? '',
    addressLine2: branch.address_line2 ?? '',
    city: branch.city ?? '',
    state: branch.state ?? '',
    country: branch.country ?? '',
    postalCode: branch.postal_code ?? '',
    phoneNumber: branch.phone_number ?? '',
  };
}

function isActive(branch: Branch) {
  return (branch.status ?? 'active') === 'active';
}

export function BranchFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const toast = useToast();
  const { branches, loading, reload } = useBranches();
  const { create, update, setPrimary, setStatus } = useBranchMutations();

  const branchId = route.params?.branchId;
  const isEditing = Boolean(branchId);
  const branch = useMemo(
    () => (branchId ? branches.find((row) => row.id === branchId) : undefined),
    [branches, branchId],
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit office' : 'Add office' });
  }, [isEditing, navigation]);

  useEffect(() => {
    if (!branch || hydrated) return;
    setForm(formFromBranch(branch));
    setLatitude(branch.latitude != null ? Number(branch.latitude) : null);
    setLongitude(branch.longitude != null ? Number(branch.longitude) : null);
    setHydrated(true);
  }, [branch, hydrated]);

  const activeCount = branches.filter(isActive).length;
  const active = branch ? isActive(branch) : true;

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Office name is required.';
    if (!form.addressLine1.trim() || !form.city.trim() || !form.country.trim()) {
      nextErrors.address = 'Select a full office address from Google Places.';
    }
    if (latitude == null || longitude == null) {
      nextErrors.address = nextErrors.address || 'Google Map location is required.';
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setError(Object.values(nextErrors)[0]);
      return;
    }
    setFieldErrors({});

    const payload = {
      branch_name: form.name.trim(),
      display_name: form.name.trim(),
      address_line1: form.addressLine1.trim(),
      address_line2: form.addressLine2.trim() || undefined,
      city: form.city.trim(),
      state: form.state.trim() || undefined,
      country: form.country.trim(),
      postal_code: form.postalCode.trim() || undefined,
      phone_number: form.phoneNumber.trim() || undefined,
      latitude,
      longitude,
    };

    setBusy(true);
    setError(null);
    try {
      if (branchId) {
        await update(branchId, payload);
        toast.push('Office updated.', 'success');
      } else {
        await create({ ...payload, is_primary: branches.length === 0 });
        toast.push('Office created.', 'success');
      }
      setTimeout(() => navigation.goBack(), 250);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to save office.');
      setError(message);
      toast.push(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary() {
    if (!branchId) return;
    setBusy(true);
    setError(null);
    try {
      await setPrimary(branchId);
      await reload();
      toast.push('Primary office updated.', 'success');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to update office.');
      setError(message);
      toast.push(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!branchId) return;
    if (active && activeCount <= 1) {
      setError('At least one active office is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setStatus(branchId, active ? 'inactive' : 'active');
      await reload();
      toast.push(active ? 'Office deactivated.' : 'Office reactivated.', 'success');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to update office.');
      setError(message);
      toast.push(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (isEditing && !branch) {
    return (
      <FormScreen>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FormAlert message="This office is no longer available." />
        )}
      </FormScreen>
    );
  }

  return (
    <FormScreen
      footer={
        <Button
          label={busy ? 'Working…' : isEditing ? 'Update office' : 'Save office'}
          loading={busy}
          fullWidth
          size="lg"
          disabled={busy}
          onPress={() => void save()}
        />
      }
    >
      <FormHero
        icon="map-pin"
        title={isEditing ? 'Edit office' : 'Add office'}
        subtitle="Each office needs a full address and a Google Map pin for directions, stock, and delivery pickup."
      />

      <FormSection title="Office" subtitle="Name customers and staff will recognize.">
        <Input
          label="Office name"
          value={form.name}
          onChangeText={(value) => {
            setField('name', value);
            setFieldErrors((current) => ({ ...current, name: '' }));
          }}
          placeholder="Downtown clinic"
          required
          error={fieldErrors.name}
        />
      </FormSection>

      <FormSection title="Address" subtitle="Search Places, then confirm the pin on the map.">
        <AddressLocationPicker
          required
          fieldError={fieldErrors.address}
          value={form.address}
          latitude={latitude}
          longitude={longitude}
          onChangeText={(value) => {
            setField('address', value);
            setFieldErrors((current) => ({ ...current, address: '' }));
          }}
          onPlaceSelected={(place) => {
            const cleared =
              !place.line1 &&
              !place.formattedAddress &&
              place.latitude == null &&
              place.longitude == null;
            setForm((current) => ({
              ...current,
              address: place.formattedAddress,
              addressLine1: place.line1 || place.formattedAddress,
              addressLine2: cleared ? '' : current.addressLine2,
              city: place.city || '',
              state: place.state || '',
              country: place.country || '',
              postalCode: place.postalCode || '',
            }));
            setLatitude(place.latitude ?? null);
            setLongitude(place.longitude ?? null);
            setFieldErrors((current) => ({ ...current, address: '' }));
          }}
        />

        <Input
          label="Flat, floor, building or landmark"
          optional
          hint="Add door-level detail here — Google search only fills the street / area."
          placeholder="Shop 12, Ground floor, near City Mall"
          value={form.addressLine2}
          onChangeText={(value) => setField('addressLine2', value)}
        />

        <FieldRow>
          <Input label="City" required value={form.city} onChangeText={(value) => setField('city', value)} editable={!(latitude != null && longitude != null)} />
          <Input label="State" optional value={form.state} onChangeText={(value) => setField('state', value)} editable={!(latitude != null && longitude != null)} />
        </FieldRow>
        <FieldRow>
          <Input
            label="Country"
            required
            value={form.country}
            onChangeText={(value) => setField('country', value)}
            editable={!(latitude != null && longitude != null)}
          />
          <Input
            label="Postal code"
            optional
            value={form.postalCode}
            onChangeText={(value) => setField('postalCode', value)}
            keyboardType="number-pad"
            editable={!(latitude != null && longitude != null)}
          />
        </FieldRow>

        <View style={[styles.pinCard, latitude == null ? styles.pinCardWarning : null]}>
          <Feather
            name={latitude != null ? 'map-pin' : 'alert-circle'}
            size={16}
            color={latitude != null ? colors.primary : colors.warning}
          />
          <Text style={latitude != null ? styles.pinText : styles.pinWarningText}>
            {latitude != null && longitude != null
              ? `Map pin saved: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              : 'Select an address from Google Places so a map pin is saved.'}
          </Text>
        </View>
      </FormSection>

      <FormSection title="Contact" subtitle="Used as the rider pickup contact for this office.">
        <Input
          label="Phone (rider contact)"
          optional
          value={form.phoneNumber}
          onChangeText={(value) => setField('phoneNumber', value)}
          keyboardType="phone-pad"
        />
      </FormSection>

      {error ? <FormAlert message={error} /> : null}

      {isEditing && branch ? (
        <FormSection title="Manage">
          {branch.is_primary ? (
            <Text style={styles.meta}>
              This is the primary office. It is used as the default pickup point and cannot be
              deactivated.
            </Text>
          ) : (
            <>
              {active ? (
                <Pressable
                  style={styles.manageRow}
                  disabled={busy}
                  onPress={() => void makePrimary()}
                >
                  <Feather name="star" size={16} color={colors.primary} />
                  <Text style={styles.manageLabel}>Set as primary office</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.manageRow} disabled={busy} onPress={() => void toggleStatus()}>
                <Feather
                  name={active ? 'slash' : 'rotate-ccw'}
                  size={16}
                  color={active ? colors.destructive : colors.primary}
                />
                <Text style={active ? styles.manageDanger : styles.manageLabel}>
                  {active ? 'Deactivate office' : 'Reactivate office'}
                </Text>
              </Pressable>
            </>
          )}
        </FormSection>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  pinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tint,
  },
  pinCardWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  pinText: { flex: 1, color: colors.foreground, fontSize: 13 },
  pinWarningText: { flex: 1, color: colors.warning, fontSize: 13 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  manageLabel: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  manageDanger: { color: colors.destructive, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
});
