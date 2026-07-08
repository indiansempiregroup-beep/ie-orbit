import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useBooking } from '../../hooks/useOpsData';
import { useBookingMutations, useEntityMaps } from '../../hooks/useOpsExtended';
import { canWriteBookings } from '../../utils/roles';
import { useAuth } from '../../contexts/AuthContext';
import { entityLabel } from '../../utils/entities';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDateTime, getApiErrorMessage, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const { user } = useAuth();
  const { booking, loading, error, reload } = useBooking(route.params.bookingId);
  const { customerMap, serviceMap, staffMap } = useEntityMaps();
  const mutations = useBookingMutations();
  const [reason, setReason] = useState('');
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canAct = canWriteBookings(user);
  const status = booking?.status ?? 'pending';

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
        if (!rescheduleAt.trim()) throw new Error('Enter a new start time (ISO format).');
        await mutations.reschedule(booking.id, rescheduleAt.trim(), reason || undefined);
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
    <View style={styles.wrap}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.title}>#{booking.booking_number ?? booking.id.slice(0, 8)}</Text>
          <Badge status={mapBookingStatus(status)} />
        </View>
        <Detail label="Customer" value={entityLabel(customerMap, booking.customer_id)} />
        <Detail label="Service" value={entityLabel(serviceMap, booking.service_id)} />
        <Detail label="Staff" value={entityLabel(staffMap, booking.staff_id, 'Unassigned')} />
        <Detail label="When" value={formatDateTime(booking.start_at)} />
        <Detail label="Duration" value={booking.duration_minutes ? `${booking.duration_minutes} min` : '—'} />
        <Detail label="Notes" value={booking.notes || '—'} />
      </Card>

      {canAct ? (
        <Card>
          <Input label="Reason (optional)" value={reason} onChangeText={setReason} />
          <Input label="Reschedule to (ISO)" value={rescheduleAt} onChangeText={setRescheduleAt} autoCapitalize="none" />
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
          <View style={styles.actions}>
            {['pending', 'draft'].includes(status) ? <Button label="Confirm" loading={actionLoading === 'confirm'} fullWidth onPress={() => void run('confirm')} /> : null}
            {['confirmed', 'pending'].includes(status) ? <Button label="Check in" variant="secondary" loading={actionLoading === 'checkin'} fullWidth onPress={() => void run('checkin')} /> : null}
            {['confirmed', 'checked_in', 'in_progress'].includes(status) ? <Button label="Complete" loading={actionLoading === 'complete'} fullWidth onPress={() => void run('complete')} /> : null}
            {!['cancelled', 'completed', 'rejected'].includes(status) ? (
              <Button label="Reschedule" variant="outline" loading={actionLoading === 'reschedule'} fullWidth onPress={() => void run('reschedule')} />
            ) : null}
            {!['cancelled', 'completed', 'rejected'].includes(status) ? (
              <Button label="Cancel booking" variant="destructive" loading={actionLoading === 'cancel'} fullWidth onPress={() => void run('cancel')} />
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.title, color: colors.foreground },
  detail: { marginTop: spacing.md, gap: 4 },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground },
  actions: { gap: spacing.md, marginTop: spacing.md },
  error: { ...typography.caption, color: colors.destructive },
});
