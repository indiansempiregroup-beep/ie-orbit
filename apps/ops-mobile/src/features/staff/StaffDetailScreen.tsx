import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
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

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>{member.full_name ?? 'Staff member'}</Text>
        <Detail label="Email" value={member.email ?? '—'} />
        <Detail label="Phone" value={member.phone_number ?? '—'} />
        <Detail label="Status" value={member.status ?? '—'} />
      </Card>
      <Card>
        <Text style={styles.section}>Weekly schedule</Text>
        {schedules.length === 0 ? (
          <Text style={styles.meta}>No schedule configured.</Text>
        ) : (
          schedules.map((row) => (
            <Text key={row.id} style={styles.scheduleRow}>
              {WEEKDAYS[row.weekday] ?? row.weekday}: {row.is_available ? `${row.shift_start} – ${row.shift_end}` : 'Off'}
            </Text>
          ))
        )}
      </Card>
      <Button label="Edit staff" fullWidth onPress={() => navigation.navigate('StaffForm', { staffId: member.id })} />
      <Button label="Edit schedule" variant="outline" fullWidth onPress={() => navigation.navigate('StaffSchedule', { staffId: member.id })} />
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
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.sm },
  meta: { ...typography.body, color: colors.mutedForeground },
  scheduleRow: { ...typography.body, color: colors.foreground, marginTop: 4 },
  detail: { marginTop: spacing.md, gap: 4 },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground },
});
