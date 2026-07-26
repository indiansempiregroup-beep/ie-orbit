import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddressPlacesField } from '../../components/AddressPlacesField';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useBranches, useBranchMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function BranchesScreen() {
  const { branches, loading, reload } = useBranches();
  const { create, setPrimary } = useBranchMutations();
  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resetForm = () => {
    setBranchName('');
    setAddress('');
    setAddressLine1('');
    setCity('');
    setState('');
    setCountry('');
    setPostalCode('');
    setLatitude(null);
    setLongitude(null);
  };

  return (
    <RefreshableScrollView contentContainerStyle={styles.wrap} onRefresh={reload}>
      <Text style={styles.title}>Offices</Text>
      <Text style={styles.subtitle}>
        At least one office is required. Each office needs a full address and Google Map pin.
      </Text>

      <Button
        label={showForm ? 'Cancel' : 'Add office'}
        variant={showForm ? 'outline' : 'primary'}
        onPress={() => setShowForm((v) => !v)}
      />

      {showForm ? (
        <Card>
          <Input label="Office name" value={branchName} onChangeText={setBranchName} placeholder="Downtown clinic" />
          <AddressPlacesField
            label="Office address"
            value={address}
            onChangeText={setAddress}
            onPlaceSelected={(place) => {
              setAddress(place.formattedAddress);
              setAddressLine1(place.line1 || place.formattedAddress);
              setCity(place.city || '');
              setState(place.state || '');
              setCountry(place.country || '');
              setPostalCode(place.postalCode || '');
              setLatitude(place.latitude ?? null);
              setLongitude(place.longitude ?? null);
            }}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label="Create office"
            loading={submitting}
            fullWidth
            onPress={async () => {
              if (!branchName.trim()) {
                setError('Office name is required.');
                return;
              }
              if (!addressLine1.trim() || !city.trim() || !country.trim()) {
                setError('Select a full office address from Google Places.');
                return;
              }
              if (latitude == null || longitude == null) {
                setError('Google Map location is required.');
                return;
              }
              setSubmitting(true);
              setError(null);
              try {
                await create({
                  branch_name: branchName.trim(),
                  display_name: branchName.trim(),
                  address_line1: addressLine1.trim(),
                  city: city.trim(),
                  state: state.trim() || undefined,
                  country: country.trim(),
                  postal_code: postalCode.trim() || undefined,
                  latitude,
                  longitude,
                  is_primary: branches.length === 0,
                });
                resetForm();
                setShowForm(false);
                setMessage('Office created.');
                await reload();
              } catch (err) {
                setError(getApiErrorMessage(err, 'Unable to create office.'));
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </Card>
      ) : null}

      {message ? <Text style={styles.success}>{message}</Text> : null}

      <ScreenState
        loading={loading && !branches.length}
        empty={!loading && branches.length === 0}
        emptyMessage="No offices yet. Add your first office to start taking bookings."
      />
      {branches.map((branch) => (
        <Card key={branch.id}>
          <View style={styles.branchRow}>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>{branch.display_name ?? branch.branch_name}</Text>
              <Text style={styles.branchMeta}>
                {[branch.address_line1, branch.city, branch.state, branch.country].filter(Boolean).join(', ') ||
                  'No location set'}
              </Text>
              {branch.latitude != null && branch.longitude != null ? (
                <Text style={styles.branchMeta}>
                  Map pin: {Number(branch.latitude).toFixed(4)}, {Number(branch.longitude).toFixed(4)}
                </Text>
              ) : null}
              {branch.is_primary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
            </View>
            {!branch.is_primary ? (
              <Pressable
                onPress={async () => {
                  try {
                    await setPrimary(branch.id);
                    setMessage('Primary office updated.');
                    await reload();
                  } catch (err) {
                    setError(getApiErrorMessage(err, 'Unable to update office.'));
                  }
                }}
              >
                <Text style={styles.link}>Set primary</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  branchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  branchInfo: { flex: 1, gap: 4 },
  branchName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  branchMeta: { ...typography.caption, color: colors.mutedForeground },
  primaryBadge: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: 4 },
  link: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
