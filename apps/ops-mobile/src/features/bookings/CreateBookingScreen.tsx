import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAvailability, useBookingMutations, useEntityMaps } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function dateFromIso(value?: string) {
  if (!value) return formatDateKey(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateKey(new Date());
  return formatDateKey(date);
}

function serviceDurationMinutes(service?: { duration_minutes?: number; durations?: Array<{ duration_minutes: number; is_default?: boolean }> } | null, fallback = 30) {
  if (!service) return fallback;
  if (typeof service.duration_minutes === 'number' && service.duration_minutes > 0) {
    return service.duration_minutes;
  }
  const defaultDuration = service.durations?.find((row) => row.is_default) ?? service.durations?.[0];
  if (defaultDuration?.duration_minutes && defaultDuration.duration_minutes > 0) {
    return defaultDuration.duration_minutes;
  }
  return fallback;
}

export function CreateBookingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CreateBooking'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const { customers, services, staff, customerMap, serviceMap, staffMap } = useEntityMaps();
  const mutations = useBookingMutations();

  const [customerId, setCustomerId] = useState(route.params?.customerId ?? '');
  const [serviceId, setServiceId] = useState(route.params?.serviceId ?? '');
  const [staffId, setStaffId] = useState(route.params?.staffId ?? '');
  const [date, setDate] = useState(() => dateFromIso(route.params?.startAt));
  const [selectedSlot, setSelectedSlot] = useState(route.params?.startAt ?? '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const durationMinutes =
    serviceDurationMinutes(selectedService, route.params?.durationMinutes ?? 30);

  const { slots, loading: slotsLoading } = useAvailability(
    date,
    staffId || undefined,
    durationMinutes,
    serviceId || undefined,
  );

  useEffect(() => {
    if (route.params?.startAt) {
      setSelectedSlot(route.params.startAt);
      setDate(dateFromIso(route.params.startAt));
    }
  }, [route.params?.startAt]);

  useEffect(() => {
    if (!selectedSlot) return;
    if (dateFromIso(selectedSlot) !== date) setSelectedSlot('');
  }, [date, selectedSlot]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: customerMap.get(c.id) ?? c.id })),
    [customers, customerMap],
  );
  const serviceOptions = useMemo(
    () => services.map((s) => ({ value: s.id, label: serviceMap.get(s.id) ?? s.name ?? s.id })),
    [services, serviceMap],
  );
  const staffOptions = useMemo(
    () => [{ value: '', label: 'Any available' }, ...staff.map((s) => ({ value: s.id, label: staffMap.get(s.id) ?? s.id }))],
    [staff, staffMap],
  );

  return (
    <FormScreen
      footer={
        <Button
          label="Create booking"
          loading={loading}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!customerId || !serviceId) {
              setError('Customer and service are required.');
              return;
            }
            if (!selectedSlot) {
              setError('Select an available time slot.');
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
                start_at: selectedSlot,
                duration_minutes: durationMinutes,
                notes: notes || undefined,
                source: 'operations_dashboard',
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
      }
    >
      <Text style={styles.title}>New booking</Text>
      <Text style={styles.subtitle}>Pick the customer, service, and an available time slot.</Text>

      <Card>
        <SelectField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />
        <View style={styles.spacer} />
        <SelectField
          label="Service"
          value={serviceId}
          options={serviceOptions}
          onChange={(value) => {
            setServiceId(value);
            setSelectedSlot('');
          }}
        />
        <View style={styles.spacer} />
        <SelectField
          label="Staff"
          value={staffId}
          options={staffOptions}
          onChange={(value) => {
            setStaffId(value);
            setSelectedSlot('');
          }}
        />
        {selectedService ? (
          <Text style={styles.hint}>
            Duration · {durationMinutes} min
            {selectedService.price != null ? ` · ${selectedService.price}` : ''}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Date & time" />
      <CalendarPicker
        value={date}
        onChange={(next) => {
          setDate(next);
          setSelectedSlot('');
        }}
      />
      <TimeSlotGrid
        slots={slots}
        selected={selectedSlot}
        onSelect={setSelectedSlot}
        loading={slotsLoading}
        emptyMessage={
          !serviceId
            ? 'Select a service to load available times.'
            : staffId
              ? 'No timeslot available for this staff on this date. Check their weekly schedule or try another day.'
              : 'No timeslot available. No staff is free for this service on this date. Try another day or assign staff to the service.'
        }
      />

      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Add booking notes" />

      {selectedSlot ? (
        <Card>
          <Text style={styles.summaryLabel}>Selected</Text>
          <Text style={styles.summaryValue}>{formatDateTime(selectedSlot)}</Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginTop: -spacing.sm },
  spacer: { height: spacing.md },
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.md },
  summaryLabel: { ...typography.caption, color: colors.mutedForeground },
  summaryValue: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: 4 },
  error: { ...typography.caption, color: colors.destructive },
});
