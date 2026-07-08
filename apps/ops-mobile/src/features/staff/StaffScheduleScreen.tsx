import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useStaffMember, useStaffSchedule, useStaffScheduleMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import type { StaffWeeklyScheduleInput } from '@ie-platform/sdk';

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
] as const;

type DayRow = StaffWeeklyScheduleInput & { label: string };

function defaultRows(): DayRow[] {
  return WEEKDAYS.map((day) => ({
    label: day.label,
    weekday: day.value,
    is_available: day.value < 6,
    shift_start: '09:00',
    shift_end: day.value === 6 ? '17:00' : '19:00',
    capacity: 1,
  }));
}

function toTimeInput(value: string) {
  return value.slice(0, 5);
}

export function StaffScheduleScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffSchedule'>>();
  const { member, loading: memberLoading } = useStaffMember(route.params.staffId);
  const { schedules, loading: scheduleLoading } = useStaffSchedule(route.params.staffId);
  const { bulkUpsert } = useStaffScheduleMutations();
  const [rows, setRows] = useState<DayRow[]>(defaultRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!schedules.length) return;
    const byWeekday = new Map(schedules.map((row) => [row.weekday, row]));
    setRows(
      WEEKDAYS.map((day) => {
        const existing = byWeekday.get(day.value);
        if (!existing) {
          return {
            label: day.label,
            weekday: day.value,
            is_available: false,
            shift_start: '09:00',
            shift_end: '17:00',
            capacity: 1,
          };
        }
        return {
          label: day.label,
          weekday: day.value,
          is_available: existing.is_available,
          shift_start: toTimeInput(existing.shift_start),
          shift_end: toTimeInput(existing.shift_end),
          capacity: existing.capacity,
        };
      }),
    );
  }, [schedules]);

  if (memberLoading || scheduleLoading) return <ScreenState loading />;

  return (
    <RefreshableScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{member?.full_name ?? 'Weekly schedule'}</Text>
      <Text style={styles.subtitle}>Configure which days and hours this staff member is available.</Text>

      {rows.map((row, index) => (
        <Card key={row.weekday}>
          <View style={styles.rowHeader}>
            <Text style={styles.dayLabel}>{row.label}</Text>
            <Switch
              value={row.is_available}
              onValueChange={(is_available) => {
                setRows((current) => current.map((item, i) => (i === index ? { ...item, is_available } : item)));
              }}
            />
          </View>
          {row.is_available ? (
            <View style={styles.times}>
              <Input
                label="Start"
                value={row.shift_start}
                onChangeText={(shift_start) => {
                  setRows((current) => current.map((item, i) => (i === index ? { ...item, shift_start } : item)));
                }}
                placeholder="09:00"
              />
              <Input
                label="End"
                value={row.shift_end}
                onChangeText={(shift_end) => {
                  setRows((current) => current.map((item, i) => (i === index ? { ...item, shift_end } : item)));
                }}
                placeholder="19:00"
              />
            </View>
          ) : null}
        </Card>
      ))}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Save schedule"
        loading={saving}
        fullWidth
        onPress={async () => {
          setSaving(true);
          setError(null);
          setMessage(null);
          try {
            await bulkUpsert(route.params.staffId, rows);
            setMessage('Schedule saved.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to save schedule.'));
          } finally {
            setSaving(false);
          }
        }}
      />
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.sm },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dayLabel: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  times: { gap: spacing.sm },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
