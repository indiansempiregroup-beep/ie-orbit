import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileBranch, MobileDiscoverService } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { CalendarPicker } from '../../components/CalendarPicker';
import { DateStrip } from '../../components/DateStrip';
import { ServiceMultiPicker } from '../../components/ServiceMultiPicker';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useScreenInsets, useTabBarLayout } from '../../theme/layout';
import { withAlpha } from '../../theme/colorUtils';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { filterFutureSlots, formatDate, formatDateKey, formatMoney, formatTime } from '../../utils/format';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type BookNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Book'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function friendlyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  const today = formatDateKey(new Date());
  const tomorrow = formatDateKey(new Date(Date.now() + 86400000));
  if (dateKey === today) return 'Today';
  if (dateKey === tomorrow) return 'Tomorrow';
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function RecapChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.recapChip} hitSlop={4}>
      <Feather name={icon} size={12} color={colors.mutedForeground} />
      <Text style={styles.recapChipText} numberOfLines={1}>
        {label}
      </Text>
      <Feather name="edit-2" size={11} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function BookingScreen() {
  const route = useRoute<RouteProp<MainTabParamList, 'Book'>>();
  const navigation = useNavigation<BookNavigation>();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const toast = useToast();
  const { headerPaddingTop } = useScreenInsets();
  const { contentInset } = useTabBarLayout();
  const primary = branding?.primaryColor ?? colors.primary;

  const [step, setStep] = useState(0);
  const [offices, setOffices] = useState<MobileBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    route.params?.serviceId ? [route.params.serviceId] : [],
  );
  const [date, setDate] = useState(() => formatDateKey(new Date()));
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [slots, setSlots] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [pointsPerCurrency, setPointsPerCurrency] = useState(bootstrap?.loyalty?.points_per_currency_unit ?? 10);
  const [maxRedeemPercent, setMaxRedeemPercent] = useState(bootstrap?.loyalty?.max_redeem_percent ?? 50);
  const [minRedeemPoints, setMinRedeemPoints] = useState(bootstrap?.loyalty?.min_redeem_points ?? 10);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const needsLocation = offices.length > 1;

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds],
  );
  const steps = [
    ...(needsLocation ? ['Location'] : []),
    'Service',
    'When',
    'Review',
    'Done',
  ];
  const serviceStep = needsLocation ? 1 : 0;
  const scheduleStep = serviceStep + 1;
  const reviewStep = scheduleStep + 1;
  const confirmedStep = reviewStep + 1;
  const progressCount = reviewStep + 1;
  const totalDurationMinutes = useMemo(
    () => selectedServices.reduce((sum, service) => sum + (service.duration_minutes || 0), 0),
    [selectedServices],
  );
  const totalPrice = useMemo(
    () => selectedServices.reduce((sum, service) => sum + (Number(service.price) || 0), 0),
    [selectedServices],
  );
  const bookingCurrency = selectedServices[0]?.currency;
  const serviceSummaryLabel = useMemo(() => {
    if (!selectedServices.length) return '';
    if (selectedServices.length === 1) return selectedServices[0].name;
    return `${selectedServices[0].name} + ${selectedServices.length - 1} more`;
  }, [selectedServices]);
  const selectedOffice = useMemo(
    () => offices.find((office) => office.id === selectedBranchId) ?? null,
    [offices, selectedBranchId],
  );

  const customerName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '';
  const customerEmail = user?.email ?? '';
  const customerPhone = user?.phone_number ?? '';

  const loadServices = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    const response = await mobileClient.mobile.discoverServices({
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    setServices(response.data.services);
  }, [tenantSlug, businessCode]);

  const loadOffices = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    const response = await mobileClient.mobile.branches({
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    const rows = response.data ?? [];
    setOffices(rows);
    if (rows.length === 1) {
      setSelectedBranchId(rows[0].id);
    } else if (rows.length > 1) {
      const primaryOffice = rows.find((row) => row.is_primary) ?? rows[0];
      setSelectedBranchId((current) => current ?? primaryOffice.id);
    }
  }, [tenantSlug, businessCode]);

  async function loadSlots(
    slotDate: string,
    selected: MobileDiscoverService[],
  ) {
    if (!selected.length) return;
    setLoading(true);
    setSlots([]);
    setSelectedSlot('');
    setError('');
    setAvailabilityMessage('');
    try {
      const response = await mobileClient.mobile.availability({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        date: slotDate,
        duration_minutes: selected.length === 1 ? selected[0].duration_minutes : undefined,
        service_id: selected.length === 1 ? selected[0].id : undefined,
        service_ids: selected.length > 1 ? selected.map((service) => service.id) : undefined,
      });
      const openSlots = filterFutureSlots(response.data.slots);
      setSlots(openSlots);
      setAvailabilityMessage(
        response.data.message ||
          (openSlots.length
            ? ''
            : 'No timeslot available for this date. Try another day.'),
      );
      setSelectedSlot('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability.');
      setSlots([]);
      setAvailabilityMessage('');
    } finally {
      setLoading(false);
    }
  }

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([loadServices(), loadOffices()]);
    if (step === scheduleStep && selectedServices.length) {
      await loadSlots(date, selectedServices);
    }
  });

  useEffect(() => {
    void loadServices().catch(() => setServices([]));
    void loadOffices().catch(() => setOffices([]));
  }, [loadServices, loadOffices]);

  useEffect(() => {
    if (route.params?.serviceId) {
      setSelectedServiceIds([route.params.serviceId]);
    }
  }, [route.params?.serviceId]);

  function updateSelectedServices(next: string[]) {
    setSelectedServiceIds(next);
    setSelectedSlot('');
    setSlots([]);
  }

  const maxRedeemablePoints = useMemo(() => {
    if (!selectedServices.length || !loyaltyEnabled || loyaltyBalance <= 0) return 0;
    const rate = Math.max(1, pointsPerCurrency);
    const maxByPercent = Math.floor(((totalPrice * maxRedeemPercent) / 100) * rate);
    return Math.max(0, Math.min(loyaltyBalance, maxByPercent));
  }, [selectedServices.length, loyaltyEnabled, loyaltyBalance, pointsPerCurrency, maxRedeemPercent, totalPrice]);

  const redeemDiscount = useMemo(() => {
    if (pointsToRedeem <= 0) return 0;
    return pointsToRedeem / Math.max(1, pointsPerCurrency);
  }, [pointsToRedeem, pointsPerCurrency]);
  const payableTotal = Math.max(0, totalPrice - redeemDiscount);
  const bookingEarnPoints = loyaltyEnabled
    ? selectedServices.reduce((sum, service) => sum + Math.max(0, Number(service.loyalty_points_earn) || 0), 0)
    : 0;

  async function loadLoyalty() {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.getLoyalty({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      const enabled = Boolean(res.data.enabled || bootstrap?.loyalty?.enabled);
      setLoyaltyEnabled(enabled);
      setLoyaltyBalance(res.data.points_balance ?? 0);
      setPointsPerCurrency(res.data.program?.points_per_currency_unit ?? 10);
      setMaxRedeemPercent(res.data.program?.max_redeem_percent ?? 50);
      setMinRedeemPoints(res.data.program?.min_redeem_points ?? 10);
      if (!enabled) setPointsToRedeem(0);
    } catch {
      setLoyaltyEnabled(Boolean(bootstrap?.loyalty?.enabled));
      setLoyaltyBalance(0);
      setPointsToRedeem(0);
    }
  }

  function resetFlow() {
    setStep(0);
    setSelectedServiceIds(route.params?.serviceId ? [route.params.serviceId] : []);
    setDate(formatDateKey(new Date()));
    setShowFullCalendar(false);
    setSlots([]);
    setSelectedSlot('');
    setNotes('');
    setError('');
    setBookingRef('');
    setBookingId('');
    setPointsToRedeem(0);
  }

  async function confirmBooking() {
    if (!selectedServices.length || !selectedSlot) return;
    if (needsLocation && !selectedBranchId) {
      setError('Select an office to continue.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Add your phone number in Profile before booking.');
      return;
    }
    if (pointsToRedeem > 0 && pointsToRedeem < minRedeemPoints) {
      setError(`Minimum redeem is ${minRedeemPoints} points.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const bookingRequest = mobileClient.mobile.requestBooking({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        items: selectedServices.map((service, index) => ({
          service_id: service.id,
          duration_minutes: service.duration_minutes,
          sort_order: index,
        })),
        branch_id: selectedBranchId,
        staff_id: null,
        customer_name: customerName.trim(),
        phone_number: customerPhone.trim(),
        email: customerEmail.trim() || undefined,
        start_at: selectedSlot,
        notes: notes.trim() || undefined,
        payment_mode: 'pay_at_venue',
        ...(pointsToRedeem > 0 ? { points_to_redeem: pointsToRedeem } : {}),
      });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Booking is taking too long. Please try again.')), 45000);
      });
      const response = await Promise.race([bookingRequest, timeout]);
      setBookingRef(response.data.booking_number || response.data.booking_id);
      setBookingId(response.data.booking_id);
      setStep(confirmedStep);
      toast.push('Booking requested.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request booking.');
    } finally {
      setLoading(false);
    }
  }

  const canContinue = useMemo(() => {
    if (needsLocation && step === 0) return Boolean(selectedBranchId);
    if (step === serviceStep) return selectedServices.length > 0;
    if (step === scheduleStep) return Boolean(selectedSlot);
    if (step === reviewStep) return Boolean(customerName.trim() && customerPhone.trim());
    return true;
  }, [
    needsLocation,
    step,
    selectedBranchId,
    serviceStep,
    selectedServices.length,
    scheduleStep,
    selectedSlot,
    reviewStep,
    customerName,
    customerPhone,
  ]);

  function nextStep() {
    if (!canContinue) {
      if (needsLocation && step === 0 && !selectedBranchId) setError('Select a location to continue.');
      else if (step === serviceStep && !selectedServices.length) setError('Select at least one service.');
      else if (step === scheduleStep && !selectedSlot) setError('Select a time to continue.');
      else if (step === reviewStep) setError('Add your phone number in Profile before booking.');
      return;
    }
    setError('');
    if (step === serviceStep) {
      setStep(scheduleStep);
      return;
    }
    if (step === scheduleStep) {
      void loadLoyalty();
      setStep(reviewStep);
      return;
    }
    if (step === reviewStep) {
      void confirmBooking();
      return;
    }
    setStep((current) => current + 1);
  }

  useEffect(() => {
    if (step !== scheduleStep || !selectedServices.length) return;
    void loadSlots(date, selectedServices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, step, selectedServiceIds, scheduleStep]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = date.split('-').map(Number);
    const selected = new Date(year, month - 1, day);
    const diffDays = Math.round((selected.getTime() - today.getTime()) / 86400000);
    if (diffDays > 13) setShowFullCalendar(true);
  }, [date]);

  const headerCopy =
    needsLocation && step === 0
      ? { title: 'Where would you like to visit?', subtitle: 'Choose a location for this appointment.' }
      : step === serviceStep
        ? { title: 'What can we help with?', subtitle: 'Tap to add one or more services.' }
        : step === scheduleStep
          ? { title: 'When works for you?', subtitle: `${totalDurationMinutes || 0} min visit · pick a day, then a time.` }
          : { title: 'Does this look right?', subtitle: 'Pay at the venue after your visit.' };

  const ctaLabel =
    step === reviewStep
      ? `Confirm · ${formatMoney(payableTotal, bookingCurrency)}`
      : step === scheduleStep
        ? 'Review booking'
        : 'Continue';

  if (step === confirmedStep) {
    return (
      <View style={[styles.confirmRoot, { paddingBottom: contentInset }]}>
        <View style={styles.confirmIcon}>
          <Feather name="check" size={36} color={colors.success} />
        </View>
        <Text style={styles.confirmTitle}>You're booked</Text>
        <Text style={styles.confirmSubtitle}>
          {selectedSlot
            ? `${friendlyDate(formatDateKey(new Date(selectedSlot)))} at ${formatTime(selectedSlot)}`
            : 'Your appointment is confirmed.'}
        </Text>
        <Card style={styles.summaryCard}>
          <View style={styles.confirmServiceHeader}>
            <View style={[styles.confirmThumb, { backgroundColor: withAlpha(primary, 0.12) }]}>
              <Feather name="calendar" size={20} color={primary} />
            </View>
            <View style={styles.confirmServiceCopy}>
              <Text style={styles.confirmServiceName}>{serviceSummaryLabel || 'Services'}</Text>
            </View>
          </View>
          {selectedOffice ? (
            <SummaryRow label="Location" value={selectedOffice.formatted_address || selectedOffice.display_name} />
          ) : null}
          <SummaryRow label="Date" value={formatDate(selectedSlot)} />
          <SummaryRow label="Time" value={formatTime(selectedSlot)} />
          <SummaryRow label="Reference" value={bookingRef} />
          <SummaryRow label="Payment" value="Pay at venue" />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, { color: primary }]}>
              {formatMoney(payableTotal, bookingCurrency)}
            </Text>
          </View>
          {bookingEarnPoints > 0 ? (
            <Text style={styles.earnHint}>You'll earn {bookingEarnPoints} pts after this visit.</Text>
          ) : null}
        </Card>
        {bookingId ? (
          <Button
            label="View appointment"
            fullWidth
            primaryColor={primary}
            onPress={() => navigation.navigate('BookingDetail', { bookingId })}
          />
        ) : null}
        <Button label="Book another" variant="outline" fullWidth onPress={resetFlow} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.stepHeader}>
          {step > 0 ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => setStep((current) => Math.max(0, current - 1))}
              accessibilityLabel="Back"
            >
              <Feather name="arrow-left" size={18} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}
          <View style={styles.progressWrap}>
            <View style={[styles.progressRow, { maxWidth: Math.min(56 + progressCount * 72, 280) }]}>
              {steps.slice(0, progressCount).map((name, index) => {
                const done = index < step;
                const active = index === step;
                return (
                  <React.Fragment key={name}>
                    <View
                      style={[
                        styles.progressDot,
                        (done || active) && { backgroundColor: primary },
                        active && styles.progressDotActive,
                      ]}
                    />
                    {index < progressCount - 1 ? (
                      <View style={[styles.progressLine, done && { backgroundColor: primary }]} />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </View>
            <Text style={styles.stepMeta}>
              {steps[step]} · {step + 1} of {progressCount}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{headerCopy.title}</Text>
        <Text style={styles.subtitle}>{headerCopy.subtitle}</Text>
        {step > 0 ? (
          <View style={styles.recapRow}>
            {needsLocation && selectedOffice && step > 0 ? (
              <RecapChip
                icon="map-pin"
                label={selectedOffice.display_name}
                onPress={() => setStep(0)}
              />
            ) : null}
            {step > serviceStep && serviceSummaryLabel ? (
              <RecapChip
                icon="layers"
                label={serviceSummaryLabel}
                onPress={() => setStep(serviceStep)}
              />
            ) : null}
            {step > scheduleStep && selectedSlot ? (
              <RecapChip
                icon="clock"
                label={`${friendlyDate(date)} · ${formatTime(selectedSlot)}`}
                onPress={() => setStep(scheduleStep)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <RefreshableScrollView
        contentContainerStyle={styles.body}
        refreshing={refreshing}
        onRefresh={onRefresh}
        primaryColor={primary}
        keyboardShouldPersistTaps="handled"
      >
        {needsLocation && step === 0
          ? offices.map((office) => {
              const selected = selectedBranchId === office.id;
              return (
                <Pressable
                  key={office.id}
                  style={[
                    styles.option,
                    selected && { borderColor: primary, backgroundColor: withAlpha(primary, 0.06) },
                  ]}
                  onPress={() => setSelectedBranchId(office.id)}
                >
                  <View style={[styles.thumb, { backgroundColor: withAlpha(primary, 0.12) }]}>
                    <Feather name="map-pin" size={18} color={primary} />
                  </View>
                  <View style={styles.optionBody}>
                    <View style={styles.optionTitleRow}>
                      <Text style={styles.optionTitle}>{office.display_name}</Text>
                      {office.is_primary ? (
                        <Text style={[styles.primaryBadge, { color: primary }]}>Primary</Text>
                      ) : null}
                    </View>
                    <Text style={styles.optionMeta}>
                      {office.formatted_address ||
                        [office.address_line1, office.city, office.state].filter(Boolean).join(', ') ||
                        'Address coming soon'}
                    </Text>
                  </View>
                  <View style={[styles.radio, selected && { borderColor: primary, backgroundColor: primary }]}>
                    {selected ? <Feather name="check" size={12} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })
          : null}

        {step === serviceStep ? (
          <ServiceMultiPicker
            services={services}
            selectedIds={selectedServiceIds}
            onChange={updateSelectedServices}
            primaryColor={primary}
          />
        ) : null}

        {step === scheduleStep ? (
          <>
            <View style={styles.scheduleHead}>
              <Text style={styles.sectionLabel}>Date</Text>
              <Pressable onPress={() => setShowFullCalendar((value) => !value)} hitSlop={8}>
                <Text style={[styles.calendarToggle, { color: primary }]}>
                  {showFullCalendar ? 'Hide calendar' : 'More dates'}
                </Text>
              </Pressable>
            </View>
            <DateStrip value={date} onChange={setDate} primaryColor={primary} />
            {showFullCalendar ? (
              <CalendarPicker value={date} onChange={setDate} primaryColor={primary} />
            ) : null}
            <TimeSlotGrid
              slots={slots}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
              loading={loading}
              emptyMessage={
                availabilityMessage || 'No timeslot available for this date. Try another day.'
              }
              label="Available times"
              primaryColor={primary}
            />
          </>
        ) : null}

        {step === reviewStep && selectedServices.length ? (
          <>
            <Card>
              <Text style={styles.ticketKicker}>Appointment</Text>
              <Text style={styles.ticketTitle}>{serviceSummaryLabel}</Text>
              <Text style={styles.ticketWhen}>
                {friendlyDate(date)} · {formatTime(selectedSlot)} · {totalDurationMinutes} min
              </Text>
              {selectedServices.map((service, index) => {
                const offsetMinutes = selectedServices
                  .slice(0, index)
                  .reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
                const itemStart = selectedSlot
                  ? new Date(new Date(selectedSlot).getTime() + offsetMinutes * 60_000)
                  : null;
                const itemEnd = itemStart
                  ? new Date(itemStart.getTime() + (service.duration_minutes || 0) * 60_000)
                  : null;
                return (
                  <View key={service.id} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: primary }]} />
                    <View style={styles.timelineBody}>
                      <Text style={styles.optionTitle}>{service.name}</Text>
                      <Text style={styles.optionMeta}>
                        {itemStart && itemEnd
                          ? `${formatTime(itemStart.toISOString())} – ${formatTime(itemEnd.toISOString())}`
                          : `${service.duration_minutes} min`}
                      </Text>
                    </View>
                    <Text style={styles.timelinePrice}>
                      {formatMoney(Number(service.price) || 0, service.currency)}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.divider} />
              <SummaryRow
                label="Location"
                value={
                  selectedOffice?.display_name ??
                  bootstrap?.business.display_name ??
                  branding?.appName ??
                  '—'
                }
              />
              <SummaryRow label="Payment" value="Pay at venue" />
              {pointsToRedeem > 0 ? (
                <SummaryRow
                  label="Points discount"
                  value={`-${formatMoney(redeemDiscount, bookingCurrency)}`}
                />
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Due at venue</Text>
                <Text style={[styles.totalValue, { color: primary }]}>
                  {formatMoney(payableTotal, bookingCurrency)}
                </Text>
              </View>
              {bookingEarnPoints > 0 ? (
                <Text style={styles.earnHint}>You'll earn {bookingEarnPoints} pts after this visit.</Text>
              ) : null}
            </Card>

            {loyaltyEnabled ? (
              <Card>
                <View style={styles.loyaltyHead}>
                  <View>
                    <Text style={styles.sectionLabel}>Reward points</Text>
                    <Text style={styles.optionMeta}>
                      Balance {loyaltyBalance} pts · {pointsPerCurrency} pts ={' '}
                      {formatMoney(1, bookingCurrency)}
                    </Text>
                  </View>
                  {maxRedeemablePoints >= minRedeemPoints ? (
                    <Pressable
                      onPress={() =>
                        setPointsToRedeem((current) => (current > 0 ? 0 : maxRedeemablePoints))
                      }
                      style={[
                        styles.useMax,
                        pointsToRedeem > 0 && { backgroundColor: withAlpha(primary, 0.12) },
                      ]}
                    >
                      <Text style={[styles.useMaxText, { color: primary }]}>
                        {pointsToRedeem > 0 ? 'Remove' : 'Use max'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {maxRedeemablePoints >= minRedeemPoints ? (
                  <>
                    <View style={styles.redeemRow}>
                      <Pressable
                        style={styles.redeemBtn}
                        onPress={() =>
                          setPointsToRedeem((current) => {
                            if (current <= 0) return 0;
                            const next = current - Math.max(1, minRedeemPoints);
                            return next < minRedeemPoints ? 0 : next;
                          })
                        }
                      >
                        <Feather name="minus" size={16} color={colors.foreground} />
                      </Pressable>
                      <Text style={styles.redeemValue}>{pointsToRedeem} pts</Text>
                      <Pressable
                        style={styles.redeemBtn}
                        onPress={() =>
                          setPointsToRedeem((current) => {
                            const stepAmount = Math.max(1, minRedeemPoints);
                            if (current <= 0) return Math.min(maxRedeemablePoints, stepAmount);
                            return Math.min(maxRedeemablePoints, current + stepAmount);
                          })
                        }
                      >
                        <Feather name="plus" size={16} color={colors.foreground} />
                      </Pressable>
                    </View>
                    {pointsToRedeem > 0 ? (
                      <Text style={styles.optionMeta}>Saves {formatMoney(redeemDiscount, bookingCurrency)}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.optionMeta}>
                    Earn points on completed visits. You need at least {minRedeemPoints} pts to redeem.
                  </Text>
                )}
              </Card>
            ) : null}

            {bootstrap?.business.cancellation_policy ? (
              <Card>
                <Text style={styles.sectionLabel}>Cancellation</Text>
                <Text style={styles.policyText}>{bootstrap.business.cancellation_policy}</Text>
              </Card>
            ) : null}

            <Input
              label="Notes"
              optional
              value={notes}
              onChangeText={setNotes}
              placeholder="Allergies, preferences, parking notes…"
              multiline
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </RefreshableScrollView>

      <View style={[styles.footer, { paddingBottom: contentInset }]}>
        {selectedServices.length > 0 && step !== reviewStep ? (
          <View style={styles.cartBar}>
            <View style={styles.cartCopy}>
              <Text style={styles.cartTitle} numberOfLines={1}>
                {serviceSummaryLabel}
              </Text>
              <Text style={styles.cartSubtitle}>
                {totalDurationMinutes} min
                {selectedSlot && step > scheduleStep ? ` · ${formatTime(selectedSlot)}` : ''}
              </Text>
            </View>
            <Text style={[styles.cartPrice, { color: primary }]}>
              {formatMoney(totalPrice, bookingCurrency)}
            </Text>
          </View>
        ) : null}
        <Button
          label={ctaLabel}
          size="lg"
          fullWidth
          loading={loading && step === reviewStep}
          disabled={!canContinue || (loading && step === scheduleStep)}
          primaryColor={primary}
          onPress={nextStep}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: { width: 36 },
  progressWrap: { flex: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  progressDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressLine: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.muted,
    marginHorizontal: 6,
  },
  stepMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 6 },
  title: { ...typography.heading, fontSize: 22, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  recapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  recapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.inputBackground,
  },
  recapChipText: { ...typography.caption, color: colors.foreground, fontWeight: '600', maxWidth: 180 },
  body: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  optionBody: { flex: 1, minWidth: 0 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionTitle: { ...typography.label, color: colors.foreground, fontWeight: '600', flexShrink: 1 },
  primaryBadge: { ...typography.tiny, fontWeight: '700', textTransform: 'uppercase' },
  optionMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2, lineHeight: 18 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarToggle: { ...typography.caption, fontWeight: '700' },
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  ticketKicker: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  ticketTitle: { ...typography.title, color: colors.foreground },
  ticketWhen: { ...typography.body, color: colors.mutedForeground, marginTop: 4, marginBottom: spacing.md },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  timelineBody: { flex: 1 },
  timelinePrice: { ...typography.caption, fontWeight: '700', color: colors.foreground },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  summaryLabel: { ...typography.body, color: colors.mutedForeground },
  summaryValue: { ...typography.body, color: colors.foreground, fontWeight: '600', flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: { ...typography.label, fontWeight: '700', color: colors.foreground },
  totalValue: { ...typography.label, fontWeight: '700' },
  earnHint: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  loyaltyHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  useMax: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.inputBackground,
  },
  useMaxText: { ...typography.caption, fontWeight: '700' },
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  redeemBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  redeemValue: {
    ...typography.label,
    fontWeight: '700',
    color: colors.foreground,
    minWidth: 80,
    textAlign: 'center',
  },
  policyText: { ...typography.caption, color: colors.mutedForeground, lineHeight: 20, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.destructive },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  cartBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartCopy: { flex: 1, minWidth: 0 },
  cartTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  cartSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  cartPrice: { ...typography.label, fontWeight: '800' },
  confirmRoot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: { ...typography.heading, color: colors.foreground },
  confirmSubtitle: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  summaryCard: { width: '100%' },
  confirmServiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  confirmThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmServiceCopy: { flex: 1 },
  confirmServiceName: { ...typography.label, fontWeight: '700', color: colors.foreground, fontSize: 16 },
});
