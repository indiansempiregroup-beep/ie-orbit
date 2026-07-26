import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { Input } from '../../components/ui/Input';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { useBooking } from '../../hooks/useOpsData';
import { useAvailability, useBookingMutations, useEntityMaps } from '../../hooks/useOpsExtended';
import { canWriteBookings } from '../../utils/roles';
import { entityLabel } from '../../utils/entities';
import { formatServicePrice } from '../../utils/services';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, getApiErrorMessage, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const { user } = useAuth();
  const { booking, loading, error, reload } = useBooking(route.params.bookingId);
  const { services, customerMap, serviceMap, staffMap } = useEntityMaps();
  const mutations = useBookingMutations();
  const [reason, setReason] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(formatDateKey(new Date()));
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canAct = canWriteBookings(user);
  const status = booking?.status ?? 'pending';
  const durationMinutes = booking?.duration_minutes ?? 30;

  const { slots, loading: slotsLoading } = useAvailability(
    rescheduleDate,
    booking?.staff_id ?? undefined,
    durationMinutes,
    booking?.service_id ?? undefined,
  );

  const serviceName = useMemo(
    () => entityLabel(serviceMap, booking?.service_id, 'Booking'),
    [serviceMap, booking?.service_id],
  );
  const servicePriceLabel = useMemo(() => {
    const service = services.find((item) => item.id === booking?.service_id);
    return formatServicePrice(service);
  }, [services, booking?.service_id]);

  async function run(action: 'confirm' | 'checkin' | 'complete' | 'cancel' | 'reschedule') {
    if (!booking) return;
    setActionLoading(action);
    setActionError(null);
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
      await reload();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Action failed.'));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || error || !booking) return <ScreenState loading={loading} error={error} />;

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
        <DetailRow label="Customer" value={entityLabel(customerMap, booking.customer_id)} />
        <DetailRow label="Staff" value={entityLabel(staffMap, booking.staff_id, 'Unassigned')} />
        <DetailRow label="When" value={formatDateTime(booking.start_at)} />
        <DetailRow label="Duration" value={booking.duration_minutes ? `${booking.duration_minutes} min` : '—'} />
        <DetailRow label="Price" value={servicePriceLabel || '—'} />
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
});
