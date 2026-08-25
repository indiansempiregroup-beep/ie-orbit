import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import type {
  StaffLeave,
  StaffServiceAssignment,
  StaffSpecialAvailability,
  StaffSlotBlock,
  StaffEmergencySlot,
} from '@ie-orbit/sdk';
import { CalendarPicker } from '../../components/CalendarPicker';
import { DateField } from '../../components/DateField';
import { DateTimeField } from '../../components/DateTimeField';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { TimeField } from '../../components/TimeField';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useServices } from '../../hooks/useOpsData';
import { useStaffSchedule } from '../../hooks/useOpsExtended';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { formatLeaveKind, leaveWindowForDay, type LeaveDayKind } from '../../utils/leaveWindows';
import type { RootStackParamList } from '../../navigation/types';

type TabKey = 'leave' | 'extra' | 'block' | 'emergency' | 'services';

function hoursFromNow(hours: number) {
  const next = new Date();
  next.setHours(next.getHours() + hours, 0, 0, 0);
  return next;
}

function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateFmt)} · ${start.toLocaleTimeString(undefined, timeFmt)} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return `${start.toLocaleString(undefined, { ...dateFmt, ...timeFmt })} → ${end.toLocaleString(undefined, { ...dateFmt, ...timeFmt })}`;
}

function leavePhase(startsAt: string, endsAt: string): 'active' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= start && now <= end) return 'active';
  if (start > now) return 'upcoming';
  return 'past';
}

const PHASE_STYLE = {
  active: { bg: '#DCFCE7', text: '#166534', label: 'Active now' },
  upcoming: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Upcoming' },
  past: { bg: '#F1F5F9', text: '#64748B', label: 'Past' },
} as const;

export function StaffAvailabilityScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffAvailability'>>();
  const staffId = route.params.staffId;
  const client = useOpsClient();
  const { businessId, ready } = useWorkspace();
  const { services } = useServices();
  const { schedules } = useStaffSchedule(staffId);
  const [tab, setTab] = useState<TabKey>('leave');
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [special, setSpecial] = useState<StaffSpecialAvailability[]>([]);
  const [blocks, setBlocks] = useState<StaffSlotBlock[]>([]);
  const [emergencies, setEmergencies] = useState<StaffEmergencySlot[]>([]);
  const [assignments, setAssignments] = useState<StaffServiceAssignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showSpecialForm, setShowSpecialForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);
  const [leaveDays, setLeaveDays] = useState<string[]>(() => [todayIso()]);
  const [leaveKind, setLeaveKind] = useState<LeaveDayKind>('full_day');
  const [leaveReason, setLeaveReason] = useState('');
  const [specialStart, setSpecialStart] = useState(() => hoursFromNow(1));
  const [specialEnd, setSpecialEnd] = useState(() => hoursFromNow(4));
  const [slotDate, setSlotDate] = useState(todayIso());
  const [slotStart, setSlotStart] = useState('09:00');
  const [slotEnd, setSlotEnd] = useState('09:30');
  const [slotReason, setSlotReason] = useState('');
  const [serviceId, setServiceId] = useState('');

  const serviceName = useMemo(() => {
    const map = new Map(services.map((service) => [service.id, service.name ?? service.id]));
    return (id: string) => map.get(id) ?? id;
  }, [services]);

  const reload = useCallback(async () => {
    if (!client || !ready || !staffId) return;
    const [leaveRes, specialRes, blockRes, emergencyRes, assignmentRes] = await Promise.all([
      client.bookings.staffLeaves.list({ staff_id: staffId, business: businessId ?? undefined }),
      client.bookings.staffSpecialAvailability.list({
        staff_id: staffId,
        business: businessId ?? undefined,
      }),
      client.bookings.staffSlotBlocks.list({ staff_id: staffId, business: businessId ?? undefined }),
      client.bookings.staffEmergencySlots.list({ staff_id: staffId, business: businessId ?? undefined }),
      client.staff.assignments.list({ staff: staffId }),
    ]);
    setLeaves(leaveRes.data ?? []);
    setSpecial(specialRes.data ?? []);
    setBlocks(blockRes.data ?? []);
    setEmergencies(emergencyRes.data ?? []);
    setAssignments(assignmentRes.data ?? []);
  }, [client, ready, staffId, businessId]);

  useEffect(() => {
    void reload().catch((err) => setError(getApiErrorMessage(err, 'Unable to load availability.')));
  }, [reload]);

  const sortedLeaves = useMemo(() => {
    return [...leaves].sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
  }, [leaves]);

  const upcomingLeaves = sortedLeaves.filter((leave) => leavePhase(leave.starts_at, leave.ends_at) !== 'past');
  const pastLeaves = sortedLeaves.filter((leave) => leavePhase(leave.starts_at, leave.ends_at) === 'past');

  const assignedIds = new Set(assignments.map((row) => row.service));
  const serviceOptions = services
    .filter((service) => !assignedIds.has(service.id))
    .map((service) => ({
      value: service.id,
      label: service.name ?? service.id,
    }));

  useEffect(() => {
    if (!serviceId && serviceOptions[0]) {
      setServiceId(serviceOptions[0].value);
    }
    if (serviceId && !serviceOptions.some((option) => option.value === serviceId)) {
      setServiceId(serviceOptions[0]?.value ?? '');
    }
  }, [serviceId, serviceOptions]);

  function deleteLeave(leave: StaffLeave) {
    Alert.alert('Remove leave', 'This will free those timeslots for booking again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!client) return;
            setBusy(true);
            try {
              await client.bookings.staffLeaves.delete(leave.id);
              await reload();
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to remove leave.'));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <FormScreen>
      <Card elevated>
        <Text style={styles.pageTitle}>Availability</Text>
        <Text style={styles.help}>
          Bookings only succeed when the staff is on schedule, not on leave, and assigned to the service.
        </Text>
        <View style={styles.tabs}>
          <Chip label={`Leave (${upcomingLeaves.length})`} active={tab === 'leave'} onPress={() => setTab('leave')} />
          <Chip label={`Extra hours (${special.length})`} active={tab === 'extra'} onPress={() => setTab('extra')} />
          <Chip label={`Blocked (${blocks.length})`} active={tab === 'block'} onPress={() => setTab('block')} />
          <Chip
            label={`Emergency (${emergencies.length})`}
            active={tab === 'emergency'}
            onPress={() => setTab('emergency')}
          />
          <Chip
            label={`Services (${assignments.length})`}
            active={tab === 'services'}
            onPress={() => setTab('services')}
          />
        </View>
      </Card>

      {tab === 'leave' ? (
        <>
          <Card elevated>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.section}>Applied leave</Text>
                <Text style={styles.help}>Active and upcoming leave blocks overlapping slots.</Text>
              </View>
              <Button
                label={showLeaveForm ? 'Close' : 'Add'}
                variant="outline"
                onPress={() => setShowLeaveForm((value) => !value)}
              />
            </View>

            {upcomingLeaves.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No leave applied</Text>
                <Text style={styles.help}>This staff member is bookable within their weekly schedule.</Text>
              </View>
            ) : (
              upcomingLeaves.map((leave) => {
                const phase = leavePhase(leave.starts_at, leave.ends_at);
                const tone = PHASE_STYLE[phase];
                return (
                  <View key={leave.id} style={styles.leaveCard}>
                    <View style={styles.leaveTop}>
                      <View style={[styles.phasePill, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.phaseText, { color: tone.text }]}>{tone.label}</Text>
                      </View>
                      <Text style={styles.leaveType}>{formatLeaveKind(leave.leave_type)}</Text>
                    </View>
                    <Text style={styles.leaveRange}>{formatRange(leave.starts_at, leave.ends_at)}</Text>
                    {leave.reason ? <Text style={styles.leaveReason}>{leave.reason}</Text> : null}
                    <View style={styles.leaveActions}>
                      <Text style={styles.meta}>{leave.approved === false ? 'Pending approval' : 'Approved'}</Text>
                      <Button label="Remove" variant="outline" onPress={() => deleteLeave(leave)} />
                    </View>
                  </View>
                );
              })
            )}

            {pastLeaves.length > 0 ? (
              <View style={styles.pastBlock}>
                <Text style={styles.pastHeading}>Past leave ({pastLeaves.length})</Text>
                {pastLeaves.slice(0, 8).map((leave) => (
                  <View key={leave.id} style={styles.pastRow}>
                    <Text style={styles.pastText}>{formatRange(leave.starts_at, leave.ends_at)}</Text>
                    <Pressable onPress={() => deleteLeave(leave)} hitSlop={8}>
                      <Text style={styles.linkDanger}>Delete</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {showLeaveForm ? (
            <FormSection
              title="Add leave"
              subtitle="Tap one or more days, then choose Half day or Full day."
            >
              <CalendarPicker
                mode="multiple"
                values={leaveDays}
                onChangeValues={setLeaveDays}
                allowPast={false}
              />
              <Text style={styles.selectedDays}>
                {leaveDays.length === 0
                  ? 'No days selected'
                  : `${leaveDays.length} day${leaveDays.length === 1 ? '' : 's'} selected`}
              </Text>
              <View style={styles.kindRow}>
                <Chip
                  label="Half day"
                  active={leaveKind === 'half_day'}
                  onPress={() => setLeaveKind('half_day')}
                />
                <Chip
                  label="Full day"
                  active={leaveKind === 'full_day'}
                  onPress={() => setLeaveKind('full_day')}
                />
              </View>
              <Text style={styles.help}>
                {leaveKind === 'half_day'
                  ? 'Blocks the first half of the staff schedule for each selected day.'
                  : 'Blocks the full scheduled shift for each selected day.'}
              </Text>
              <Input
                label="Reason (optional)"
                value={leaveReason}
                onChangeText={setLeaveReason}
                placeholder="e.g. Family event"
              />
              <Button
                label={leaveDays.length ? `Save leave (${leaveDays.length})` : 'Save leave'}
                fullWidth
                loading={busy}
                disabled={leaveDays.length === 0}
                onPress={() => {
                  void (async () => {
                    if (!client) return;
                    if (leaveDays.length === 0) {
                      setError('Select at least one day on the calendar.');
                      return;
                    }
                    setBusy(true);
                    setError(null);
                    try {
                      await Promise.all(
                        leaveDays.map((day) => {
                          const window = leaveWindowForDay(day, leaveKind, schedules);
                          return client.bookings.staffLeaves.create({
                            business: businessId ?? undefined,
                            staff_id: staffId,
                            starts_at: window.starts_at,
                            ends_at: window.ends_at,
                            leave_type: window.leave_type,
                            reason: leaveReason.trim(),
                            approved: true,
                          });
                        }),
                      );
                      setLeaveReason('');
                      setLeaveDays([todayIso()]);
                      setLeaveKind('full_day');
                      setShowLeaveForm(false);
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to add leave.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </FormSection>
          ) : null}
        </>
      ) : null}

      {tab === 'extra' ? (
        <>
          <Card elevated>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.section}>Extra open hours</Text>
                <Text style={styles.help}>One-off windows that override the weekly schedule for that day.</Text>
              </View>
              <Button
                label={showSpecialForm ? 'Close' : 'Add'}
                variant="outline"
                onPress={() => setShowSpecialForm((value) => !value)}
              />
            </View>
            {special.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No extra hours</Text>
                <Text style={styles.help}>Add a window when staff can take bookings outside the normal week.</Text>
              </View>
            ) : (
              special.map((row) => (
                <View key={row.id} style={styles.leaveCard}>
                  <Text style={styles.leaveRange}>{formatRange(row.starts_at, row.ends_at)}</Text>
                  {row.reason ? <Text style={styles.leaveReason}>{row.reason}</Text> : null}
                  <View style={styles.leaveActions}>
                    <Text style={styles.meta}>Capacity {row.capacity ?? 1}</Text>
                    <Button
                      label="Remove"
                      variant="outline"
                      onPress={() => {
                        void (async () => {
                          if (!client) return;
                          await client.bookings.staffSpecialAvailability.delete(row.id);
                          await reload();
                        })();
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
          {showSpecialForm ? (
            <FormSection title="Add extra hours" subtitle="Choose a one-off window outside the weekly schedule.">
              <DateTimeField label="Starts" value={specialStart} onChange={setSpecialStart} />
              <DateTimeField label="Ends" value={specialEnd} onChange={setSpecialEnd} />
              <Button
                label="Save window"
                fullWidth
                loading={busy}
                onPress={() => {
                  void (async () => {
                    if (!client) return;
                    if (specialEnd <= specialStart) {
                      setError('End must be after start.');
                      return;
                    }
                    setBusy(true);
                    setError(null);
                    try {
                      await client.bookings.staffSpecialAvailability.create({
                        business: businessId ?? undefined,
                        staff_id: staffId,
                        starts_at: specialStart.toISOString(),
                        ends_at: specialEnd.toISOString(),
                        capacity: 1,
                      });
                      setShowSpecialForm(false);
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to add special availability.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </FormSection>
          ) : null}
        </>
      ) : null}

      {tab === 'block' ? (
        <>
          <Card elevated>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.section}>Blocked slots</Text>
                <Text style={styles.help}>Remove a specific available window so customers cannot book it.</Text>
              </View>
              <Button
                label={showBlockForm ? 'Close' : 'Block'}
                variant="outline"
                onPress={() => setShowBlockForm((value) => !value)}
              />
            </View>
            {blocks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No blocked slots</Text>
                <Text style={styles.help}>Weekly schedule slots remain bookable unless blocked here.</Text>
              </View>
            ) : (
              blocks.map((block) => (
                <View key={block.id} style={styles.leaveCard}>
                  <Text style={styles.leaveRange}>
                    {block.date} · {block.start_time} – {block.end_time}
                  </Text>
                  {block.reason ? <Text style={styles.leaveReason}>{block.reason}</Text> : null}
                  <View style={styles.leaveActions}>
                    <Text style={styles.meta}>Blocked</Text>
                    <Button
                      label="Remove"
                      variant="outline"
                      onPress={() => {
                        void (async () => {
                          if (!client) return;
                          setBusy(true);
                          try {
                            await client.bookings.staffSlotBlocks.delete(block.id);
                            await reload();
                          } catch (err) {
                            setError(getApiErrorMessage(err, 'Unable to remove block.'));
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
          {showBlockForm ? (
            <FormSection title="Block a slot" subtitle="Customers cannot book this exact window.">
              <DateField label="Date" value={slotDate} onChange={setSlotDate} allowClear={false} allowPast={false} />
              <TimeField label="Start" value={slotStart} onChange={setSlotStart} />
              <TimeField label="End" value={slotEnd} onChange={setSlotEnd} />
              <Input label="Reason (optional)" value={slotReason} onChangeText={setSlotReason} />
              <Button
                label="Save block"
                fullWidth
                loading={busy}
                onPress={() => {
                  void (async () => {
                    if (!client || !businessId) return;
                    setBusy(true);
                    try {
                      await client.bookings.staffSlotBlocks.create({
                        business: businessId,
                        staff_id: staffId,
                        date: slotDate,
                        start_time: slotStart,
                        end_time: slotEnd,
                        reason: slotReason || undefined,
                      });
                      setShowBlockForm(false);
                      setSlotReason('');
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to block slot.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </FormSection>
          ) : null}
        </>
      ) : null}

      {tab === 'emergency' ? (
        <>
          <Card elevated>
            <View style={styles.sectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.section}>Emergency open slots</Text>
                <Text style={styles.help}>Add a one-off open window on top of the weekly schedule.</Text>
              </View>
              <Button
                label={showEmergencyForm ? 'Close' : 'Add'}
                variant="outline"
                onPress={() => setShowEmergencyForm((value) => !value)}
              />
            </View>
            {emergencies.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No emergency slots</Text>
                <Text style={styles.help}>Use this when you need an extra open window without replacing the day.</Text>
              </View>
            ) : (
              emergencies.map((slot) => (
                <View key={slot.id} style={styles.leaveCard}>
                  <Text style={styles.leaveRange}>
                    {slot.date} · {slot.start_time} – {slot.end_time}
                  </Text>
                  {slot.reason ? <Text style={styles.leaveReason}>{slot.reason}</Text> : null}
                  <View style={styles.leaveActions}>
                    <Text style={styles.meta}>Open</Text>
                    <Button
                      label="Remove"
                      variant="outline"
                      onPress={() => {
                        void (async () => {
                          if (!client) return;
                          setBusy(true);
                          try {
                            await client.bookings.staffEmergencySlots.delete(slot.id);
                            await reload();
                          } catch (err) {
                            setError(getApiErrorMessage(err, 'Unable to remove emergency slot.'));
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
          {showEmergencyForm ? (
            <FormSection title="Add emergency open" subtitle="Adds bookable time without replacing the weekly day.">
              <DateField label="Date" value={slotDate} onChange={setSlotDate} allowClear={false} allowPast={false} />
              <TimeField label="Start" value={slotStart} onChange={setSlotStart} />
              <TimeField label="End" value={slotEnd} onChange={setSlotEnd} />
              <Input label="Reason (optional)" value={slotReason} onChangeText={setSlotReason} />
              <Button
                label="Save emergency slot"
                fullWidth
                loading={busy}
                onPress={() => {
                  void (async () => {
                    if (!client || !businessId) return;
                    setBusy(true);
                    try {
                      await client.bookings.staffEmergencySlots.create({
                        business: businessId,
                        staff_id: staffId,
                        date: slotDate,
                        start_time: slotStart,
                        end_time: slotEnd,
                        capacity: 1,
                        reason: slotReason || undefined,
                      });
                      setShowEmergencyForm(false);
                      setSlotReason('');
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to add emergency slot.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </FormSection>
          ) : null}
        </>
      ) : null}

      {tab === 'services' ? (
        <Card elevated>
          <Text style={styles.section}>Assigned services</Text>
          <Text style={styles.help}>
            Once a service is assigned, this staff can only be booked for their assigned services. Unassigned services
            are blocked for timeslots and booking create.
          </Text>

          {assignments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No services assigned yet</Text>
              <Text style={styles.help}>Until you assign services, this staff can still be booked for any service.</Text>
            </View>
          ) : (
            assignments.map((row) => (
              <View key={row.id} style={styles.leaveCard}>
                <Text style={styles.leaveRange}>{serviceName(row.service)}</Text>
                <View style={styles.leaveActions}>
                  <Text style={styles.meta}>{row.is_active_assignment === false ? 'Inactive' : 'Active'}</Text>
                  <Button
                    label="Remove"
                    variant="outline"
                    onPress={() => {
                      void (async () => {
                        if (!client) return;
                        await client.staff.assignments.delete(row.id);
                        await reload();
                      })();
                    }}
                  />
                </View>
              </View>
            ))
          )}

          {serviceOptions.length > 0 ? (
            <>
              <View style={styles.spacer} />
              <SelectField
                label="Add service"
                value={serviceId}
                options={serviceOptions}
                onChange={setServiceId}
                placeholder="Select a service"
              />
              <View style={styles.spacer} />
              <Button
                label="Assign service"
                fullWidth
                loading={busy}
                disabled={!serviceId}
                onPress={() => {
                  void (async () => {
                    if (!client || !serviceId) return;
                    setBusy(true);
                    setError(null);
                    try {
                      await client.staff.assignments.create({
                        staff: staffId,
                        service: serviceId,
                        is_active_assignment: true,
                      });
                      setServiceId('');
                      await reload();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to assign service.'));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </>
          ) : (
            <Text style={styles.help}>All services are already assigned, or no services exist.</Text>
          )}
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontFamily: fonts.displayMedium, fontSize: 20, color: colors.foreground, marginBottom: spacing.xs },
  section: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground, marginBottom: spacing.xs },
  help: { ...typography.caption, color: colors.mutedForeground, marginBottom: spacing.sm },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  flex: { flex: 1 },
  spacer: { height: spacing.md },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  selectedDays: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground, marginTop: spacing.sm },
  emptyBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.muted,
    marginTop: spacing.sm,
  },
  emptyTitle: { ...typography.label, color: colors.foreground, marginBottom: spacing.xs },
  leaveCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.inputBackground,
  },
  leaveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  phasePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  phaseText: { ...typography.tiny, fontWeight: '700' },
  leaveType: { ...typography.caption, color: colors.mutedForeground, textTransform: 'capitalize' },
  leaveRange: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  leaveReason: { ...typography.caption, color: colors.mutedForeground },
  leaveActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meta: { ...typography.caption, color: colors.mutedForeground },
  pastBlock: { marginTop: spacing.lg, gap: spacing.sm },
  pastHeading: { ...typography.label, color: colors.mutedForeground, fontWeight: '700' },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pastText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  linkDanger: { ...typography.caption, color: colors.destructive, fontWeight: '600' },
  error: { ...typography.caption, color: colors.destructive, marginTop: spacing.sm },
});
