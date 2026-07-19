import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { ScreenState } from '../../components/ScreenState';
import { useStaffMember, useStaffSchedule } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function StaffDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { member, loading } = useStaffMember(route.params.staffId);
  const { schedules } = useStaffSchedule(route.params.staffId);

  if (loading || !member) return <ScreenState loading={loading} empty={!loading && !member} />;

  const name = member.full_name?.trim() || member.email || 'Staff member';

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{member.status ?? 'Active'}</Text>
          </View>
        </View>
        <DetailRow label="Email" value={member.email ?? '—'} />
        <DetailRow label="Phone" value={member.phone_number ?? '—'} />
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
                {row.is_available ? `${row.shift_start} – ${row.shift_end}` : 'Off'}
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
      <Button
        label="Book with staff"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { staffId: member.id })}
      />
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
});
