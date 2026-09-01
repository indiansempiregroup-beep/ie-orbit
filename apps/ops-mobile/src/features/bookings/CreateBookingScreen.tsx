import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StaffServiceAssignment } from '@ie-orbit/sdk';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAvailability, useBookingMutations, useBranches, useEntityMaps } from '../../hooks/useOpsExtended';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, getApiErrorMessage } from '../../utils/format';
import {
  formatServiceMeta,
  servicesSummaryLabel,
  servicesTotalDurationMinutes,
  servicesTotalPriceLabel,
  serviceDurationMinutes,
} from '../../utils/services';
import { ServiceMultiPicker } from '../../components/ServiceMultiPicker';
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
  const client = useOpsClient();
  const { customers, services, staff, customerMap, serviceMap, staffMap } = useEntityMaps();
  const { branches } = useBranches();
  const mutations = useBookingMutations();

  const [customerId, setCustomerId] = useState(route.params?.customerId ?? '');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    route.params?.serviceId ? [route.params.serviceId] : [],
  );
  const [staffId, setStaffId] = useState(showStaffPicker ? route.params?.staffId ?? '' : '');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(() => dateFromIso(route.params?.startAt));
  const [selectedSlot, setSelectedSlot] = useState(route.params?.startAt ?? '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<StaffServiceAssignment[]>([]);

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

  useEffect(() => {
    if (!client || !showStaffPicker) {
      setAssignments([]);
      return;
    }
    let cancelled = false;
    void client.staff.assignments
      .list({})
      .then((response) => {
        if (!cancelled) setAssignments(response.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, showStaffPicker]);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds],
  );
  const durationMinutes = servicesTotalDurationMinutes(
    selectedServices,
    route.params?.durationMinutes ?? 30,
  );
  const servicePriceLabel = servicesTotalPriceLabel(selectedServices);
  const serviceSummaryLabel = servicesSummaryLabel(selectedServices, (service) =>
    serviceMap.get(service.id) ?? service.name ?? service.id,
  );

  const eligibleStaff = useMemo(() => {
    const activeStaff = staff.filter(
      (member) =>
        member.is_bookable &&
        member.employment_status === 'active' &&
        (member.is_active === undefined || member.is_active),
    );
    if (!selectedServiceIds.length) return activeStaff;
    const active = assignments.filter((row) => row.is_active_assignment !== false);
    const staffWithAnyAssignment = new Set(active.map((row) => String(row.staff)));
    return activeStaff.filter((member) => {
      const id = String(member.id);
      if (!staffWithAnyAssignment.has(id)) return true;
      return selectedServiceIds.every((serviceId) =>
        active.some(
          (row) => String(row.service) === String(serviceId) && String(row.staff) === id,
        ),
      );
    });
  }, [assignments, selectedServiceIds, staff]);

  const requiresMultipleSpecialists =
    selectedServiceIds.length > 1 && eligibleStaff.length === 0;

  useEffect(() => {
    if (requiresMultipleSpecialists) {
      setStaffId('');
      return;
    }
    if (!staffId) return;
    if (!eligibleStaff.some((member) => member.id === staffId)) {
      setStaffId('');
      setSelectedSlot('');
    }
  }, [eligibleStaff, requiresMultipleSpecialists, staffId]);

  const { slots, loading: slotsLoading } = useAvailability(
    date,
    requiresMultipleSpecialists ? undefined : staffId || undefined,
    durationMinutes,
    selectedServiceIds.length === 1 ? selectedServiceIds[0] : undefined,
    selectedServiceIds.length > 1 ? selectedServiceIds : undefined,
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

  function updateSelectedServices(next: string[]) {
    setSelectedServiceIds(next);
    setStaffId('');
    setSelectedSlot('');
  }

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: customerMap.get(c.id) ?? c.id })),
    [customers, customerMap],
  );
  const staffOptions = useMemo(
    () => [
      {
        value: '',
        label: selectedServiceIds.length
          ? `Any available (${eligibleStaff.length} eligible)`
          : 'Any available',
      },
      ...eligibleStaff.map((s) => ({ value: s.id, label: staffMap.get(s.id) ?? s.id })),
    ],
    [eligibleStaff, selectedServiceIds.length, staffMap],
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
            if (!customerId || !selectedServiceIds.length) {
              setError('Customer and at least one service are required.');
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
                items: selectedServices.map((service, index) => ({
                  service_id: service.id,
                  duration_minutes: serviceDurationMinutes(service),
                  sort_order: index,
                })),
                staff_id: requiresMultipleSpecialists ? null : staffId || null,
                branch_id: branchId || null,
                start_at: selectedSlot,
                notes: notes || undefined,
                source: 'operations_dashboard',
                channel: 'mobile',
              });
              navigation.replace('BookingDetail', {
                bookingId: booking.id,
                initialBooking: booking,
              });
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
            ? 'Customer, services, office, and preferred staff'
            : 'Customer, services, and office'
        }
      >
        <SelectField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />

        <ServiceMultiPicker
          services={services}
          selectedIds={selectedServiceIds}
          onChange={updateSelectedServices}
          nameFor={(service) => serviceMap.get(service.id) ?? service.name ?? service.id}
        />

        {needsOfficePicker ? (
          <SelectField label="Office" value={branchId} options={branchOptions} onChange={setBranchId} />
        ) : null}

        {showStaffPicker ? (
          requiresMultipleSpecialists ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Multiple specialists will be assigned</Text>
              <Text style={styles.hint}>
                No single staff member covers all selected services. The system will assign the best
                available team for each service.
              </Text>
            </View>
          ) : (
            <SelectField
              label="Staff"
              value={staffId}
              options={staffOptions}
              onChange={(value) => {
                setStaffId(value);
                setSelectedSlot('');
              }}
              placeholder={selectedServiceIds.length ? 'Choose eligible staff' : 'Select services first'}
            />
          )
        ) : null}

        {selectedServices.length === 1 ? (
          <Text style={styles.hint}>{formatServiceMeta(selectedServices[0])}</Text>
        ) : null}
        {showStaffPicker && selectedServiceIds.length > 0 && eligibleStaff.length === 0 && !requiresMultipleSpecialists ? (
          <Text style={styles.error}>
            No staff is assigned to the selected services. Assign services on the staff profile.
          </Text>
        ) : null}
        {showStaffPicker && selectedServiceIds.length > 0 && !staffId && !requiresMultipleSpecialists ? (
          <Text style={styles.hint}>
            Any available assigns only among staff who can perform all selected services.
          </Text>
        ) : null}
      </FormSection>

      <FormSection
        step={2}
        title="Date & time"
        subtitle={
          selectedServices.length > 1
            ? `Showing slots for ${serviceSummaryLabel} (${durationMinutes} min total)`
            : 'Only open slots for the selected service are shown'
        }
      >
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
            !selectedServiceIds.length
              ? 'Select at least one service to load available times.'
              : staffId
                ? 'No timeslot available for this staff on this date. Check their weekly schedule or try another day.'
                : requiresMultipleSpecialists
                  ? 'No timeslot available for this service combination on this date. Try another day.'
                  : 'No timeslot available. No staff is free for the selected services on this date.'
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
  infoCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  infoTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  hint: { ...typography.caption, color: colors.mutedForeground },
  selected: { ...typography.label, color: colors.primary },
  error: { ...typography.caption, color: colors.destructive },
});
