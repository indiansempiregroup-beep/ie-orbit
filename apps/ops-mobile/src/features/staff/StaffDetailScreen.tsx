import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useStaffMember, useStaffMutations, useStaffSchedule } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatClock(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function StaffDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const { member, loading, reload } = useStaffMember(route.params.staffId);
  const { schedules } = useStaffSchedule(route.params.staffId);
  const mutations = useStaffMutations();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || !member) return <ScreenState loading={loading} empty={!loading && !member} />;

  const name =
    member.display_name?.trim() ||
    member.full_name?.trim() ||
    `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() ||
    member.email ||
    'Staff member';
  const status = member.employment_status || member.status || 'active';
  const isInactive = status === 'inactive' || status === 'terminated' || status === 'archived' || member.is_active === false;
  const hasLogin = Boolean(member.user);

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" src={member.photo_url} />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{status}</Text>
          </View>
        </View>
        <DetailRow label="Email" value={member.email ?? '—'} />
        <DetailRow label="Phone" value={member.phone_number ?? '—'} />
        <DetailRow label="App login" value={hasLogin ? 'Linked account' : 'Not invited / not accepted yet'} />
      </Card>
      <Card>
        <Text style={styles.section}>Weekly schedule</Text>
        {schedules.length === 0 ? (
          <Text style={styles.empty}>No schedule configured.</Text>
        ) : (
          schedules.map((row) => (
            <View key={row.id} style={styles.scheduleRow}>
              <Text style={styles.day}>{WEEKDAYS[row.weekday] ?? row.weekday}</Text>
              <Text style={styles.hours}>
                {row.is_available
                  ? `${formatClock(row.shift_start)} – ${formatClock(row.shift_end)}`
                  : 'Off'}
              </Text>
            </View>
          ))
        )}
      </Card>
      <Button label="Edit staff" fullWidth onPress={() => navigation.navigate('StaffForm', { staffId: member.id })} />
      <Button
        label="Edit schedule"
        variant="outline"
        fullWidth
        onPress={() => navigation.navigate('StaffSchedule', { staffId: member.id })}
      />
      {!hasLogin && member.email ? (
        <Button
          label="Send login invitation"
          variant="secondary"
          fullWidth
          loading={busy}
          onPress={async () => {
            if (!client || !businessId || !member.email) return;
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              await client.invitations.create(businessId, {
                email: member.email,
                platform_role_code: 'staff',
              });
              setMessage('Invitation sent. They can accept via email, then sign in on OPS-Mobile.');
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to send invitation.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      <Button
        label="Book with staff"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { staffId: member.id })}
      />
      <Button
        label={isInactive ? 'Reactivate staff' : 'Deactivate staff'}
        variant={isInactive ? 'outline' : 'destructive'}
        fullWidth
        onPress={() => {
          Alert.alert(
            isInactive ? 'Reactivate staff' : 'Deactivate staff',
            isInactive
              ? 'Restore this staff member for scheduling and bookings?'
              : 'They will be hidden from active scheduling. You can reactivate later.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: isInactive ? 'Reactivate' : 'Deactivate',
                style: isInactive ? 'default' : 'destructive',
                onPress: () => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      if (isInactive) await mutations.reactivate(member.id);
                      else await mutations.deactivate(member.id);
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to update staff status.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                },
              },
            ],
          );
        }}
      />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  heroCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, textTransform: 'capitalize' },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.mutedForeground },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  day: { ...typography.label, color: colors.foreground },
  hours: { ...typography.caption, color: colors.mutedForeground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
