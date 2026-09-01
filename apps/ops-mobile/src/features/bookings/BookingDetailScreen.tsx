import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { Input } from '../../components/ui/Input';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBooking } from '../../hooks/useOpsData';
import { useAvailability, useBookingMutations, useEntityMaps, useReassignableStaff } from '../../hooks/useOpsExtended';
import { canWriteBookings } from '../../utils/roles';
import { entityLabel } from '../../utils/entities';
import { formatServicePrice } from '../../utils/services';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, formatTime, getApiErrorMessage, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function formatLineItemPrice(value?: string | number | null): string | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(amount);
  } catch {
    return `INR ${amount.toFixed(2)}`;
  }
}

export function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const { user } = useAuth();
  const toast = useToast();
  const { booking, loading, error, reload } = useBooking(
    route.params.bookingId,
    route.params.initialBooking,
  );
  const { services, customers, customerMap, serviceMap, staffMap, staff } = useEntityMaps();
  const mutations = useBookingMutations();
  const [reason, setReason] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState('');
  const [lineStaffDraft, setLineStaffDraft] = useState<Record<string, string>>({});
  const [rescheduleDate, setRescheduleDate] = useState(formatDateKey(new Date()));
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const canAct = canWriteBookings(user);
  const status = booking?.status ?? 'pending';
  const durationMinutes = booking?.duration_minutes ?? 30;

  const serviceIds = useMemo(
    () => (booking?.line_items?.length ? booking.line_items.map((item) => item.service_id) : undefined),
    [booking?.line_items],
  );

  const { slots, loading: slotsLoading } = useAvailability(
    rescheduleDate,
    booking?.staff_id ?? undefined,
    durationMinutes,
    booking?.service_id ?? undefined,
    serviceIds,
  );

  const serviceName = useMemo(() => {
    if (booking?.service_label?.trim()) return booking.service_label;
    if (booking?.line_items?.length) {
      const names = booking.line_items
        .map((item) => item.service_name || entityLabel(serviceMap, item.service_id, ''))
        .filter(Boolean);
      if (names.length === 1) return names[0];
      if (names.length > 1) return `${names[0]} + ${names.length - 1} more`;
    }
    return entityLabel(serviceMap, booking?.service_id, 'Booking');
  }, [booking?.service_label, booking?.line_items, booking?.service_id, serviceMap]);

  const customerName = useMemo(() => {
    if (booking?.customer_name?.trim()) return booking.customer_name;
    return entityLabel(customerMap, booking?.customer_id);
  }, [booking?.customer_name, booking?.customer_id, customerMap]);

  const customer = useMemo(
    () => (booking?.customer_id ? customers.find((row) => row.id === booking.customer_id) : null),
    [booking?.customer_id, customers],
  );

  const customerPhone = booking?.customer_phone?.trim() || customer?.phone_number?.trim() || '';

  const customerAddress = useMemo(() => {
    if (!customer) return '';
    return (
      customer.full_address?.trim() ||
      customer.address?.full_address?.trim() ||
      [
        customer.address?.line1,
        customer.address?.line2,
        customer.address?.city,
        customer.address?.state,
        customer.address?.postal_code,
      ]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ')
    );
  }, [customer]);

  const staffName = useMemo(() => {
    if (booking?.staff_name?.trim()) return booking.staff_name;
    return entityLabel(staffMap, booking?.staff_id, 'Unassigned');
  }, [booking?.staff_name, booking?.staff_id, staffMap]);

  const servicePriceLabel = useMemo(() => {
    if (booking?.line_items?.length) {
      const total = booking.line_items.reduce((sum, item) => sum + (Number(item.price_snapshot) || 0), 0);
      if (total > 0) {
        return formatLineItemPrice(total) ?? '—';
      }
    }
    const service = services.find((item) => String(item.id) === String(booking?.service_id));
    return formatServicePrice(service) || '—';
  }, [booking?.line_items, booking?.service_id, services]);

  const usePerLineReassign = (booking?.line_items?.length ?? 0) > 1;
  const {
    data: reassignableStaff,
    loading: reassignableLoading,
    error: reassignableError,
  } = useReassignableStaff(booking?.id, staffModalOpen);

  const fallbackStaffOptions = useMemo(
    () =>
      staff.map((member) => ({
        value: member.id,
        label: member.display_name || member.full_name || member.email || member.id,
      })),
    [staff],
  );

  const staffOptions = useMemo(() => {
    const auto = { value: '', label: 'Auto-assign' };
    if (reassignableStaff?.mode === 'single') {
      return [
        auto,
        ...(reassignableStaff.staff_options ?? []).map((member) => ({
          value: member.id,
          label: member.display_name,
        })),
      ];
    }
    if (!reassignableLoading && (reassignableError || !reassignableStaff)) {
      return [auto, ...fallbackStaffOptions];
    }
    return [auto];
  }, [reassignableStaff, reassignableLoading, reassignableError, fallbackStaffOptions]);

  const lineStaffOptionsMap = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string }>> = {};
    const fallback = [{ value: '', label: 'Auto-assign' }, ...fallbackStaffOptions];
    if (reassignableStaff?.mode === 'per_line') {
      for (const [lineId, options] of Object.entries(reassignableStaff.line_item_options ?? {})) {
        map[lineId] = [
          { value: '', label: 'Auto-assign' },
          ...options.map((member) => ({ value: member.id, label: member.display_name })),
        ];
      }
      return map;
    }
    if (!reassignableLoading && (reassignableError || !reassignableStaff)) {
      for (const item of booking?.line_items ?? []) {
        map[item.id] = fallback;
      }
    }
    return map;
  }, [reassignableStaff, reassignableLoading, reassignableError, fallbackStaffOptions, booking?.line_items]);

  function openStaffModal() {
    if (!booking) return;
    setReassignError(null);
    setActionError(null);
    setStaffDraft(booking.staff_id ?? '');
    setLineStaffDraft(
      Object.fromEntries((booking.line_items ?? []).map((item) => [item.id, item.staff_id ?? ''])),
    );
    setStaffModalOpen(true);
  }

  async function run(action: 'confirm' | 'checkin' | 'complete' | 'cancel' | 'reschedule' | 'reassign') {
    if (!booking) return;
    setActionLoading(action);
    setActionError(null);
    if (action === 'reassign') setReassignError(null);
    try {
      if (action === 'confirm') await mutations.confirm(booking.id, reason || undefined);
      if (action === 'checkin') await mutations.checkIn(booking.id, reason || undefined);
      if (action === 'complete') await mutations.complete(booking.id, reason || undefined);
      if (action === 'cancel') await mutations.cancel(booking.id, reason || undefined);
      if (action === 'reschedule') {
        if (!rescheduleSlot) throw new Error('Select a new time slot.');
        await mutations.reschedule(booking.id, rescheduleSlot, reason || undefined);
        setShowReschedule(false);
        setRescheduleSlot('');
      }
      if (action === 'reassign') {
        const changed = usePerLineReassign
          ? (booking.line_items ?? []).some(
              (item) => (lineStaffDraft[item.id] ?? '') !== (item.staff_id ?? ''),
            )
          : (staffDraft || '') !== (booking.staff_id ?? '');
        if (!changed) {
          setReassignError('Choose a different staff member before confirming.');
          return;
        }
        if (usePerLineReassign) {
          await mutations.updateLineItemStaff(
            booking.id,
            (booking.line_items ?? []).map((item) => ({
              line_item_id: item.id,
              staff_id: lineStaffDraft[item.id] || null,
            })),
          );
        } else {
          await mutations.updateStaff(booking.id, staffDraft || null);
        }
        setStaffModalOpen(false);
        setReassignError(null);
        toast.push('Staff reassigned. Assigned staff members have been notified.', 'success');
      }
      await reload();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Action failed.');
      if (action === 'reassign') {
        setReassignError(message);
      } else {
        setActionError(message);
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || error || !booking) {
    return (
      <ScreenState
        loading={loading}
        error={error}
        actionLabel={error ? 'Retry' : undefined}
        onAction={error ? () => void reload() : undefined}
      />
    );
  }

  return (
    <FormScreen>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.icon}>
            <Feather name="calendar" size={18} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{serviceName}</Text>
            <Text style={styles.ref}>#{booking.booking_number ?? booking.id.slice(0, 8)}</Text>
          </View>
          <Badge status={mapBookingStatus(status)} />
        </View>
        {booking.customer_id ? (
          <CustomerDetailLinkCard
            customerId={booking.customer_id}
            customerName={customerName}
            customerPhone={customerPhone}
            customerEmail={customer?.email?.trim() || undefined}
            addressPreview={customerAddress || undefined}
          />
        ) : (
          <DetailRow label="Customer" value={customerName} />
        )}
        <DetailRow label="Staff" value={staffName} />
        <DetailRow label="Starts" value={formatDateTime(booking.start_at)} />
        <DetailRow label="Ends" value={formatDateTime(booking.end_at)} />
        <DetailRow label="Duration" value={booking.duration_minutes ? `${booking.duration_minutes} min` : '—'} />
        {booking.line_items?.length ? (
          <View style={styles.itemsBlock}>
            <Text style={styles.itemsLabel}>Services</Text>
            {booking.line_items.map((item) => (
              <Text key={item.id} style={styles.itemRow}>
                {item.service_name || entityLabel(serviceMap, item.service_id, 'Service')}
                {' · '}
                {item.start_at ? formatTime(item.start_at) : '—'}
                {' · '}
                {item.duration_minutes} min
                {item.staff_name || item.staff_id
                  ? ` · ${item.staff_name || entityLabel(staffMap, item.staff_id, '')}`
                  : ''}
              </Text>
            ))}
          </View>
        ) : null}
        <DetailRow label="Price" value={servicePriceLabel} />
        <DetailRow label="Notes" value={booking.notes || '—'} />
      </Card>

      {booking.review ? (
        <Card>
          <SectionHeader title="Customer review" />
          <Text style={styles.rating}>
            {'★'.repeat(booking.review.rating)}
            {'☆'.repeat(5 - booking.review.rating)}
          </Text>
          <Text style={styles.reviewComment}>{booking.review.comment?.trim() || 'No written comment.'}</Text>
          <Text style={styles.reviewMeta}>{formatDateTime(booking.review.created_at)}</Text>
        </Card>
      ) : null}

      {canAct ? (
        <Card>
          <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Visible in audit trail" />
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
          <View style={styles.actions}>
            {['pending', 'draft'].includes(status) ? (
              <Button label="Confirm" loading={actionLoading === 'confirm'} fullWidth onPress={() => void run('confirm')} />
            ) : null}
            {['confirmed', 'pending'].includes(status) ? (
              <Button
                label="Check in"
                variant="secondary"
                loading={actionLoading === 'checkin'}
                fullWidth
                onPress={() => void run('checkin')}
              />
            ) : null}
            {['confirmed', 'checked_in', 'in_progress'].includes(status) ? (
              <Button label="Complete" loading={actionLoading === 'complete'} fullWidth onPress={() => void run('complete')} />
            ) : null}
            {!['cancelled', 'completed', 'rejected'].includes(status) ? (
              <Button
                label={showReschedule ? 'Hide reschedule' : 'Reschedule'}
                variant="outline"
                fullWidth
                onPress={() => {
                  setShowReschedule((v) => !v);
                  setRescheduleDate(formatDateKey(booking.start_at ? new Date(booking.start_at) : new Date()));
                  setRescheduleSlot('');
                }}
              />
            ) : null}
            {!['cancelled', 'completed', 'rejected'].includes(status) ? (
              <Button
                label="Reassign staff"
                variant="outline"
                fullWidth
                onPress={openStaffModal}
              />
            ) : null}
            {!['cancelled', 'completed', 'rejected'].includes(status) ? (
              <Button
                label="Cancel booking"
                variant="destructive"
                loading={actionLoading === 'cancel'}
                fullWidth
                onPress={() => void run('cancel')}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      <Modal
        visible={staffModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setStaffModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setStaffModalOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reassign staff</Text>
              <Pressable onPress={() => setStaffModalOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.sheetHint}>
                {usePerLineReassign
                  ? 'Choose staff assigned to each service. Busy staff may fail reassignment — reschedule if needed.'
                  : 'Choose staff who can perform this booking. Busy staff may fail reassignment — reschedule if needed.'}
              </Text>
              {reassignableLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {reassignableError ? <Text style={styles.error}>{reassignableError}</Text> : null}
              {reassignableError && !reassignableStaff ? (
                <Text style={styles.sheetHint}>
                  Could not load availability filter. Showing all staff — reassignment may fail if they are busy.
                </Text>
              ) : null}
              {usePerLineReassign ? (
                (booking.line_items ?? []).map((item) => (
                  <SelectField
                    key={item.id}
                    label={
                      item.service_name || entityLabel(serviceMap, item.service_id, 'Service')
                    }
                    value={lineStaffDraft[item.id] ?? ''}
                    options={lineStaffOptionsMap[item.id] ?? [{ value: '', label: 'Auto-assign' }]}
                    onChange={(next) =>
                      setLineStaffDraft((current) => ({ ...current, [item.id]: next }))
                    }
                    placeholder="Choose staff"
                  />
                ))
              ) : (
                <SelectField
                  label="Staff member"
                  value={staffDraft}
                  options={staffOptions}
                  onChange={setStaffDraft}
                  placeholder="Choose staff"
                />
              )}
              {reassignError ? <Text style={styles.error}>{reassignError}</Text> : null}
              <Button
                label="Confirm reassignment"
                loading={actionLoading === 'reassign'}
                fullWidth
                size="lg"
                onPress={() => void run('reassign')}
              />
              <Button label="Cancel" variant="ghost" fullWidth onPress={() => setStaffModalOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {canAct && showReschedule ? (
        <View style={styles.reschedule}>
          <SectionHeader title="Reschedule to" />
          <CalendarPicker
            value={rescheduleDate}
            onChange={(next) => {
              setRescheduleDate(next);
              setRescheduleSlot('');
            }}
          />
          <TimeSlotGrid
            slots={slots}
            selected={rescheduleSlot}
            onSelect={setRescheduleSlot}
            loading={slotsLoading}
            emptyMessage="No timeslot available for this staff on this date. Try another day."
          />
          {rescheduleSlot ? (
            <Card>
              <Text style={styles.summaryLabel}>New time</Text>
              <Text style={styles.summaryValue}>{formatDateTime(rescheduleSlot)}</Text>
            </Card>
          ) : null}
          <Button
            label="Confirm reschedule"
            loading={actionLoading === 'reschedule'}
            fullWidth
            size="lg"
            onPress={() => void run('reschedule')}
          />
        </View>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  ref: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  actions: { gap: spacing.md, marginTop: spacing.md },
  error: { ...typography.caption, color: colors.destructive, marginTop: spacing.sm },
  reschedule: { gap: spacing.md },
  summaryLabel: { ...typography.caption, color: colors.mutedForeground },
  summaryValue: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: 4 },
  rating: { ...typography.title, fontSize: 18, color: colors.primary, marginTop: spacing.xs },
  reviewComment: { ...typography.body, color: colors.mutedForeground, marginTop: spacing.sm, lineHeight: 20 },
  reviewMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  itemsBlock: { marginBottom: spacing.sm },
  itemsLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', marginBottom: spacing.xs },
  itemRow: { ...typography.body, color: colors.foreground, marginBottom: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.foreground },
  sheetContent: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl },
  sheetHint: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
});
