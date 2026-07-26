import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAvailability, useBookingMutations, useBranches, useEntityMaps } from '../../hooks/useOpsExtended';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, getApiErrorMessage } from '../../utils/format';
import { formatServiceMeta, formatServicePrice, serviceDurationMinutes } from '../../utils/services';
import type { RootStackParamList } from '../../navigation/types';

function dateFromIso(value?: string) {
  if (!value) return formatDateKey(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateKey(new Date());
  return formatDateKey(date);
}

export function CreateBookingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CreateBooking'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showStaffPicker = canAccessStaffDirectory(user);
  const { businessId } = useWorkspace();
  const { customers, services, staff, customerMap, serviceMap, staffMap } = useEntityMaps();
  const { branches } = useBranches();
  const mutations = useBookingMutations();

  const [customerId, setCustomerId] = useState(route.params?.customerId ?? '');
  const [serviceId, setServiceId] = useState(route.params?.serviceId ?? '');
  const [staffId, setStaffId] = useState(showStaffPicker ? route.params?.staffId ?? '' : '');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(() => dateFromIso(route.params?.startAt));
  const [selectedSlot, setSelectedSlot] = useState(route.params?.startAt ?? '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branches.length) return;
    if (branches.length === 1) {
      setBranchId(branches[0].id);
      return;
    }
    setBranchId((current) => {
      if (current && branches.some((branch) => branch.id === current)) return current;
      return branches.find((branch) => branch.is_primary)?.id ?? branches[0].id;
    });
  }, [branches]);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const durationMinutes = serviceDurationMinutes(selectedService, route.params?.durationMinutes ?? 30);
  const servicePriceLabel = formatServicePrice(selectedService);
  const serviceMetaLabel = formatServiceMeta(selectedService);

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
    () => [
      { value: '', label: 'Any available' },
      ...staff.map((s) => ({ value: s.id, label: staffMap.get(s.id) ?? s.id })),
    ],
    [staff, staffMap],
  );
  const branchOptions = useMemo(
    () =>
      branches.map((branch) => ({
        value: branch.id,
        label:
          branch.display_name ||
          branch.branch_name ||
          [branch.address_line1, branch.city].filter(Boolean).join(', ') ||
          branch.id,
      })),
    [branches],
  );
  const needsOfficePicker = branches.length > 1;

  return (
    <FormScreen
      footer={
        <Button
          label={
            selectedSlot
              ? `Book · ${formatDateTime(selectedSlot)}${servicePriceLabel ? ` · ${servicePriceLabel}` : ''}`
              : 'Create booking'
          }
          loading={loading}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!customerId || !serviceId) {
              setError('Customer and service are required.');
              return;
            }
            if (needsOfficePicker && !branchId) {
              setError('Select an office for this booking.');
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
                branch_id: branchId || null,
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
      <View style={styles.intro}>
        <Text style={styles.title}>New booking</Text>
        <Text style={styles.subtitle}>Who, what, then when — three quick steps.</Text>
      </View>

      <FormSection
        step={1}
        title="Who & what"
        subtitle={
          showStaffPicker
            ? 'Customer, service, office, and preferred staff'
            : 'Customer, service, and office'
        }
      >
        <SelectField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />
        <SelectField
          label="Service"
          value={serviceId}
          options={serviceOptions}
          onChange={(value) => {
            setServiceId(value);
            setSelectedSlot('');
          }}
        />
        {needsOfficePicker ? (
          <SelectField label="Office" value={branchId} options={branchOptions} onChange={setBranchId} />
        ) : null}
        {showStaffPicker ? (
          <SelectField
            label="Staff"
            value={staffId}
            options={staffOptions}
            onChange={(value) => {
              setStaffId(value);
              setSelectedSlot('');
            }}
          />
        ) : null}
        {selectedService ? <Text style={styles.hint}>{serviceMetaLabel}</Text> : null}
      </FormSection>

      <FormSection step={2} title="Date & time" subtitle="Only open slots for the selected service are shown">
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
        {selectedSlot ? <Text style={styles.selected}>Selected · {formatDateTime(selectedSlot)}</Text> : null}
      </FormSection>

      <FormSection step={3} title="Notes" subtitle="Optional details for the team">
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Add booking notes"
        />
      </FormSection>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4, marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground },
  selected: { ...typography.label, color: colors.primary },
  error: { ...typography.caption, color: colors.destructive },
});
