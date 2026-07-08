import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useEntityMaps, useBookingMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function CreateBookingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CreateBooking'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const { customers, services, staff, customerMap, serviceMap, staffMap } = useEntityMaps();
  const mutations = useBookingMutations();

  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState(route.params?.serviceId ?? '');
  const [staffId, setStaffId] = useState(route.params?.staffId ?? '');
  const [startAt, setStartAt] = useState(route.params?.startAt ?? new Date().toISOString());
  const [durationMinutes, setDurationMinutes] = useState(String(route.params?.durationMinutes ?? 30));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: customerMap.get(c.id) ?? c.id })), [customers, customerMap]);
  const serviceOptions = useMemo(() => services.map((s) => ({ value: s.id, label: serviceMap.get(s.id) ?? s.name ?? s.id })), [services, serviceMap]);
  const staffOptions = useMemo(
    () => [{ value: '', label: 'Unassigned' }, ...staff.map((s) => ({ value: s.id, label: staffMap.get(s.id) ?? s.id }))],
    [staff, staffMap],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>New booking</Text>
      <SelectField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />
      <SelectField label="Service" value={serviceId} options={serviceOptions} onChange={setServiceId} />
      <SelectField label="Staff" value={staffId} options={staffOptions} onChange={setStaffId} />
      <Input label="Start (ISO datetime)" value={startAt} onChangeText={setStartAt} autoCapitalize="none" />
      <Input label="Duration (minutes)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Create booking"
        loading={loading}
        fullWidth
        onPress={async () => {
          if (!customerId || !serviceId) {
            setError('Customer and service are required.');
            return;
          }
          setLoading(true);
          setError(null);
          try {
            const booking = await mutations.create({
              business: businessId ?? undefined,
              customer_id: customerId,
              service_id: serviceId,
              staff_id: staffId || null,
              start_at: startAt,
              duration_minutes: Number(durationMinutes) || 30,
              notes: notes || undefined,
              source: 'ops_mobile',
              channel: 'mobile',
            });
            navigation.replace('BookingDetail', { bookingId: booking.id });
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to create booking.'));
          } finally {
            setLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
