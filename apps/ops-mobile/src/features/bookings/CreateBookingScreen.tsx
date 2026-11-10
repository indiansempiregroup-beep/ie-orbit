import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { StaffServiceAssignment } from '@ie-orbit/sdk';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { IconBadge } from '../../components/ui/IconBadge';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAvailability, useBookingMutations, useBranches, useEntityMaps } from '../../hooks/useOpsExtended';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, getApiErrorMessage } from '../../utils/format';
import { bumpBookingsListRevision } from '../../utils/bookingsListRefresh';
import {
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

function addDays(from: Date, days: number) {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return next;
}

function friendlyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function RecapRow({
  icon,
  label,
  value,
  pending,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  pending?: boolean;
}) {
  return (
    <View style={styles.recapRow}>
      <Feather name={icon} size={14} color={pending ? colors.mutedForeground : colors.primary} />
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={[styles.recapValue, pending && styles.recapPending]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function CreateBookingScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'CreateBooking'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showStaffPicker = canAccessStaffDirectory(user);
  const { businessId } = useWorkspace();
  const client = useOpsClient();
  const toast = useToast();
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<StaffServiceAssignment[]>([]);
  const [staffHints, setStaffHints] = useState<
    Array<{
      label?: string;
      discount_type?: string;
      discount_value?: string;
      message?: string;
      workflow_name?: string;
    }>
  >([]);

  const quickDates = useMemo(() => {
    const today = new Date();
    return [0, 1, 2, 3, 4].map((offset) => {
      const day = addDays(today, offset);
      const key = formatDateKey(day);
      const label =
        offset === 0
          ? t('common.today')
          : offset === 1
            ? t('bookings.createMobile.tomorrow')
            : day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      return { key, label };
    });
  }, [t]);

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

  useEffect(() => {
    if (!client || !businessId || !customerId) {
      setStaffHints([]);
      return;
    }
    let cancelled = false;
    void client.bookings
      .eligibleOffers({ business_id: businessId, customer_id: customerId })
      .then((response) => {
        if (cancelled) return;
        setStaffHints(response.data.staff_hints || []);
      })
      .catch(() => {
        if (!cancelled) setStaffHints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, client, customerId]);

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
  const customerName = customerId ? customerMap.get(customerId) ?? t('bookings.customer') : '';
  const staffName = staffId ? staffMap.get(staffId) ?? t('bookings.staff') : t('bookings.createMobile.anyAvailable');

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

  function pickDate(next: string) {
    setDate(next);
    setSelectedSlot('');
    setFieldErrors((current) => ({ ...current, slot: '' }));
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
          ? t('bookings.createMobile.anyAvailableEligible', { n: eligibleStaff.length })
          : t('bookings.createMobile.anyAvailable'),
      },
      ...eligibleStaff.map((s) => ({ value: s.id, label: staffMap.get(s.id) ?? s.id })),
    ],
    [eligibleStaff, selectedServiceIds.length, staffMap, t],
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
  const recapWhen = selectedSlot ? formatDateTime(selectedSlot) : friendlyDate(date);
  const recapFooter = [customerName || null, serviceSummaryLabel || null, selectedSlot ? formatDateTime(selectedSlot) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <FormScreen
      footer={
        <View style={styles.footerBlock}>
          <Text style={styles.footerRecap} numberOfLines={2}>
            {recapFooter || t('bookings.createMobile.footerHint')}
          </Text>
          <Button
            label={selectedSlot ? t('bookings.createMobile.confirmBooking') : t('bookings.create')}
            icon={selectedSlot ? 'check' : 'calendar'}
            loading={loading}
            fullWidth
            size="lg"
            onPress={async () => {
              if (!customerId || !selectedServiceIds.length) {
                setFieldErrors({
                  ...(!customerId ? { customer: t('bookings.createMobile.customerRequired') } : {}),
                  ...(!selectedServiceIds.length ? { services: t('bookings.selectServiceError') } : {}),
                });
                setError(t('bookings.createMobile.customerServiceRequired'));
                return;
              }
              if (needsOfficePicker && !branchId) {
                setFieldErrors({ office: t('bookings.selectOfficeError') });
                setError(t('bookings.selectOfficeError'));
                return;
              }
              if (!selectedSlot) {
                setFieldErrors({ slot: t('bookings.createMobile.slotRequired') });
                setError(t('bookings.createMobile.slotRequired'));
                return;
              }
              setFieldErrors({});
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
                toast.push(t('bookings.bookingCreated'), 'success');
                bumpBookingsListRevision();
                navigation.replace('BookingDetail', {
                  bookingId: booking.id,
                  initialBooking: booking,
                });
              } catch (err) {
                setError(getApiErrorMessage(err, t('bookings.createFailed')));
              } finally {
                setLoading(false);
              }
            }}
          />
        </View>
      }
    >
      <FormHero subtitle={t('bookings.createMobile.heroSubtitle')} />

      {staffHints.length > 0 ? (
        <View style={styles.offerBanner}>
          <IconBadge icon="gift" tone="cyan" size="sm" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.offerTitle}>{t('bookings.automationOffer')}</Text>
            {staffHints.map((hint, index) => {
              const pct =
                hint.discount_type === 'percent' && Number(hint.discount_value) > 0
                  ? t('bookings.offPct', { value: hint.discount_value })
                  : hint.discount_type === 'amount' && Number(hint.discount_value) > 0
                    ? t('bookings.createMobile.amountOff', { amount: `₹${hint.discount_value}` })
                    : null;
              return (
                <Text key={`${hint.label}-${index}`} style={styles.offerBody}>
                  {[hint.label || hint.workflow_name || t('bookings.createMobile.specialOffer'), pct, hint.message]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.recapCard}>
        <RecapRow
          icon="user"
          label={t('bookings.customer')}
          value={customerName || t('bookings.createMobile.notSelected')}
          pending={!customerId}
        />
        <RecapRow
          icon="layers"
          label={t('bookings.createMobile.recapVisit')}
          value={
            selectedServices.length
              ? `${serviceSummaryLabel}${servicePriceLabel ? ` · ${servicePriceLabel}` : ''} · ${t('bookings.minutesShort', { n: durationMinutes })}`
              : t('bookings.createMobile.noServicesYet')
          }
          pending={!selectedServices.length}
        />
        <RecapRow
          icon="clock"
          label={t('bookings.when')}
          value={selectedSlot ? recapWhen : t('bookings.createMobile.pickTime', { date: friendlyDate(date) })}
          pending={!selectedSlot}
        />
        {showStaffPicker ? (
          <RecapRow
            icon="users"
            label={t('bookings.staff')}
            value={requiresMultipleSpecialists ? t('bookings.createMobile.multipleSpecialists') : staffName}
          />
        ) : null}
      </View>

      <FormSection
        step={1}
        title={t('bookings.createMobile.whoWhat')}
        subtitle={
          showStaffPicker
            ? t('bookings.createMobile.whoWhatStaff')
            : t('bookings.createMobile.whoWhatNoStaff')
        }
      >
        <SelectField
          label={t('bookings.customer')}
          required
          value={customerId}
          options={customerOptions}
          placeholder={t('bookings.createMobile.searchCustomers')}
          onChange={(value) => {
            setCustomerId(value);
            setFieldErrors((current) => ({ ...current, customer: '' }));
            setError(null);
          }}
          error={fieldErrors.customer}
        />

        <ServiceMultiPicker
          required
          error={fieldErrors.services}
          services={services}
          selectedIds={selectedServiceIds}
          onChange={(ids) => {
            updateSelectedServices(ids);
            setFieldErrors((current) => ({ ...current, services: '' }));
            setError(null);
          }}
          nameFor={(service) => serviceMap.get(service.id) ?? service.name ?? service.id}
        />

        {needsOfficePicker ? (
          <SelectField
            label={t('bookings.createMobile.office')}
            required
            value={branchId}
            options={branchOptions}
            onChange={(value) => {
              setBranchId(value);
              setFieldErrors((current) => ({ ...current, office: '' }));
              setError(null);
            }}
            error={fieldErrors.office}
          />
        ) : null}

        {showStaffPicker ? (
          requiresMultipleSpecialists ? (
            <View style={styles.callout}>
              <IconBadge icon="users" tone="cyan" size="sm" />
              <View style={styles.calloutCopy}>
                <Text style={styles.calloutTitle}>{t('bookings.createMobile.multiSpecialistTitle')}</Text>
                <Text style={styles.hint}>
                  {t('bookings.createMobile.multiSpecialistBody')}
                </Text>
              </View>
            </View>
          ) : (
            <SelectField
              label={t('bookings.staff')}
              optional
              value={staffId}
              options={staffOptions}
              onChange={(value) => {
                setStaffId(value);
                setSelectedSlot('');
                setFieldErrors((current) => ({ ...current, slot: '' }));
              }}
              placeholder={
                selectedServiceIds.length
                  ? t('bookings.createMobile.chooseEligibleStaff')
                  : t('bookings.createMobile.selectServicesFirst')
              }
              hint={
                selectedServiceIds.length && !staffId && eligibleStaff.length > 0
                  ? t('bookings.createMobile.anyAvailableHint')
                  : undefined
              }
            />
          )
        ) : null}

        {showStaffPicker && selectedServiceIds.length > 0 && eligibleStaff.length === 0 && !requiresMultipleSpecialists ? (
          <View style={styles.calloutWarn}>
            <IconBadge icon="alert-circle" tone="amber" size="sm" />
            <Text style={styles.calloutWarnText}>
              {t('bookings.createMobile.noStaffForServices')}
            </Text>
          </View>
        ) : null}
      </FormSection>

      <FormSection
        step={2}
        title={t('bookings.createMobile.dateTime')}
        subtitle={
          selectedServices.length > 1
            ? t('bookings.createMobile.slotsFor', { services: serviceSummaryLabel, minutes: durationMinutes })
            : selectedServices.length === 1
              ? t('bookings.createMobile.openSlotsFor', { services: serviceSummaryLabel })
              : t('bookings.createMobile.selectServicesToLoadTimes')
        }
      >
        <View style={styles.quickDates}>
          {quickDates.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              active={date === item.key}
              onPress={() => pickDate(item.key)}
            />
          ))}
        </View>

        <CalendarPicker
          value={date}
          allowPast={false}
          onChange={(next) => pickDate(next)}
        />
        <TimeSlotGrid
          slots={slots}
          selected={selectedSlot}
          onSelect={(startAt) => {
            setSelectedSlot(startAt);
            setFieldErrors((current) => ({ ...current, slot: '' }));
            setError(null);
          }}
          loading={slotsLoading}
          error={fieldErrors.slot}
          emptyMessage={
            !selectedServiceIds.length
              ? t('bookings.createMobile.emptySelectService')
              : staffId
                ? t('bookings.createMobile.emptyStaff')
                : requiresMultipleSpecialists
                  ? t('bookings.createMobile.emptyCombo')
                  : t('bookings.createMobile.emptyNone')
          }
        />
        {selectedSlot ? (
          <Pressable
            onPress={() => setSelectedSlot('')}
            style={styles.selectedChip}
            accessibilityRole="button"
            accessibilityLabel={t('bookings.createMobile.clearSelectedTime')}
          >
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={styles.selected}>
              {t('bookings.createMobile.selectedTime', { when: formatDateTime(selectedSlot) })}
            </Text>
            <Text style={styles.clearSlot}>{t('bookings.createMobile.change')}</Text>
          </Pressable>
        ) : null}
      </FormSection>

      <FormSection
        step={3}
        title={t('shop.pos.notes')}
        subtitle={t('bookings.createMobile.notesSubtitle')}
      >
        <Input
          label={t('shop.pos.notes')}
          optional
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder={t('bookings.createMobile.notesPlaceholder')}
        />
      </FormSection>

      {error ? <FormAlert message={error} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  recapCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  offerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  offerTitle: { ...typography.label, color: colors.primary, fontWeight: '700' },
  offerBody: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recapLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    width: 72,
  },
  recapValue: {
    ...typography.label,
    color: colors.foreground,
    flex: 1,
    textAlign: 'right',
  },
  recapPending: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontWeight: '400',
  },
  quickDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  calloutCopy: { flex: 1, gap: spacing.xs },
  calloutTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  calloutWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  calloutWarnText: { ...typography.caption, color: colors.foreground, flex: 1, lineHeight: 18 },
  hint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  selected: { ...typography.label, color: colors.primary, flex: 1 },
  clearSlot: { ...typography.caption, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
  footerBlock: { gap: spacing.sm },
  footerRecap: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center', lineHeight: 18 },
});
