import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MobileBranch, MobileDiscoverService } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { CalendarPicker } from '../../components/CalendarPicker';
import { ServiceMultiPicker } from '../../components/ServiceMultiPicker';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileStaff } from '../../hooks/useMobileStaff';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useScreenInsets, useTabBarLayout } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { filterFutureSlots, formatDateKey, formatMoney, formatTime } from '../../utils/format';
import type { MainTabParamList } from '../../navigation/types';

export function BookingScreen() {
  const route = useRoute<RouteProp<MainTabParamList, 'Book'>>();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
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
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => formatDateKey(new Date()));
  const [slots, setSlots] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [pointsPerCurrency, setPointsPerCurrency] = useState(bootstrap?.loyalty?.points_per_currency_unit ?? 10);
  const [maxRedeemPercent, setMaxRedeemPercent] = useState(bootstrap?.loyalty?.max_redeem_percent ?? 50);
  const [minRedeemPoints, setMinRedeemPoints] = useState(bootstrap?.loyalty?.min_redeem_points ?? 10);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const needsLocation = offices.length > 1;
  const steps = needsLocation
    ? ['Location', 'Service', 'Staff', 'Date & Time', 'Review', 'Confirmed']
    : ['Service', 'Staff', 'Date & Time', 'Review', 'Confirmed'];
  const serviceStep = needsLocation ? 1 : 0;
  const stylistStep = needsLocation ? 2 : 1;
  const scheduleStep = needsLocation ? 3 : 2;
  const reviewStep = needsLocation ? 4 : 3;
  const confirmedStep = needsLocation ? 5 : 4;

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds],
  );
  const primaryServiceId = selectedServiceIds[0] ?? null;
  const { staff } = useMobileStaff(primaryServiceId);
  const commonStaff = useMemo(() => {
    if (!selectedServices.length) return [];
    const staffSets = selectedServices.map(
      (service) => new Set((service.staff ?? []).map((member) => member.id)),
    );
    return staff.filter((member) => staffSets.every((set) => set.has(member.id)));
  }, [selectedServices, staff]);
  const requiresMultipleSpecialists = selectedServices.length > 1 && commonStaff.length === 0;
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
  const selectedStaff = selectedStaffId
    ? (commonStaff.find((member) => member.id === selectedStaffId) ??
        staff.find((member) => member.id === selectedStaffId) ??
        null)
    : null;
  const stylistLabel = requiresMultipleSpecialists
    ? 'Assigned specialists'
    : selectedStaff?.display_name ?? (selectedStaffId === '' ? 'Any available' : '');

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
      const primary = rows.find((row) => row.is_primary) ?? rows[0];
      setSelectedBranchId((current) => current ?? primary.id);
    }
  }, [tenantSlug, businessCode]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([loadServices(), loadOffices()]);
    if (step === scheduleStep && selectedServices.length && selectedStaffId !== null) {
      await loadSlots(selectedStaffId, date, selectedServices);
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
    setSelectedStaffId(null);
    setSelectedSlot('');
    setSlots([]);
  }

  async function loadSlots(
    staffId: string,
    slotDate: string,
    selected: MobileDiscoverService[],
  ) {
    if (!selected.length) return;
    setLoading(true);
    setError('');
    setAvailabilityMessage('');
    try {
      const response = await mobileClient.mobile.availability({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        date: slotDate,
        duration_minutes: selected.length === 1 ? selected[0].duration_minutes : undefined,
        staff_id: staffId || undefined,
        service_id: selected.length === 1 ? selected[0].id : undefined,
        service_ids: selected.length > 1 ? selected.map((service) => service.id) : undefined,
      });
      const openSlots = filterFutureSlots(response.data.slots);
      setSlots(openSlots);
      setAvailabilityMessage(
        response.data.message ||
          (openSlots.length
            ? ''
            : 'No timeslot available for this date. Try another day or staff member.'),
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

  const maxRedeemablePoints = useMemo(() => {
    if (!selectedServices.length || !loyaltyEnabled || loyaltyBalance <= 0) return 0;
    const rate = Math.max(1, pointsPerCurrency);
    const maxByPercent = Math.floor((totalPrice * maxRedeemPercent) / 100 * rate);
    return Math.max(0, Math.min(loyaltyBalance, maxByPercent));
  }, [selectedServices.length, loyaltyEnabled, loyaltyBalance, pointsPerCurrency, maxRedeemPercent, totalPrice]);

  const redeemDiscount = useMemo(() => {
    if (pointsToRedeem <= 0) return 0;
    return pointsToRedeem / Math.max(1, pointsPerCurrency);
  }, [pointsToRedeem, pointsPerCurrency]);
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

  async function confirmBooking() {
    if (!selectedServices.length || !selectedSlot || selectedStaffId === null) return;
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
        staff_id: requiresMultipleSpecialists ? null : selectedStaffId || null,
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
      setStep(confirmedStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request booking.');
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    if (needsLocation && step === 0 && !selectedBranchId) {
      setError('Select an office to continue.');
      return;
    }
    if (step === serviceStep && !selectedServices.length) {
      setError('Select at least one service to continue.');
      return;
    }
    if (step === stylistStep && selectedStaffId === null && !requiresMultipleSpecialists) {
      setError('Select a staff member or Any available to continue.');
      return;
    }
    if (step === stylistStep) {
      const effectiveStaffId = requiresMultipleSpecialists ? '' : selectedStaffId;
      if (selectedServices.length && effectiveStaffId !== null) {
        void loadSlots(effectiveStaffId, date, selectedServices);
      }
      if (requiresMultipleSpecialists) {
        setSelectedStaffId('');
      }
      setStep(scheduleStep);
      return;
    }
    if (step === scheduleStep && !selectedSlot) {
      setError('Select a time slot to continue.');
      return;
    }
    setError('');
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
    if (step === stylistStep && requiresMultipleSpecialists) {
      setSelectedStaffId('');
    }
  }, [step, stylistStep, requiresMultipleSpecialists]);

  useEffect(() => {
    if (step !== scheduleStep || !selectedServices.length || selectedStaffId === null) return;
    void loadSlots(selectedStaffId, date, selectedServices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, step, selectedServiceIds, selectedStaffId, scheduleStep]);

  if (step === confirmedStep) {
    return (
      <View style={styles.confirmRoot}>
        <View style={styles.confirmIcon}>
          <Feather name="check" size={36} color={colors.success} />
        </View>
        <Text style={styles.confirmTitle}>Booking Confirmed!</Text>
        <Text style={styles.confirmSubtitle}>Confirmation sent to {customerEmail || 'your email'}.</Text>
        <Card style={styles.summaryCard}>
          <View style={styles.confirmServiceHeader}>
            <View style={[styles.confirmThumb, { backgroundColor: `${primary}12` }]}>
              <Feather name="calendar" size={20} color={primary} />
            </View>
            <View style={styles.confirmServiceCopy}>
              <Text style={styles.confirmServiceName}>{serviceSummaryLabel || 'Services'}</Text>
              {stylistLabel ? <Text style={styles.confirmServiceMeta}>{stylistLabel}</Text> : null}
            </View>
          </View>
          {selectedOffice ? (
            <SummaryRow
              label="Location"
              value={selectedOffice.formatted_address || selectedOffice.display_name}
            />
          ) : null}
          <SummaryRow label="Date" value={new Date(selectedSlot).toLocaleDateString()} />
          <SummaryRow label="Time" value={formatTime(selectedSlot)} />
          <SummaryRow label="Reference" value={bookingRef} />
          <SummaryRow label="Payment" value="Pay at venue" />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, { color: primary }]}>
              {formatMoney(Math.max(0, totalPrice - redeemDiscount), bookingCurrency)}
            </Text>
          </View>
          {bookingEarnPoints > 0 ? (
            <Text style={styles.earnHint}>
              You'll earn {bookingEarnPoints} pts after this visit is completed.
            </Text>
          ) : null}
        </Card>
        <Button label="Done" primaryColor={primary} onPress={() => setStep(0)} />
      </View>
    );
  }

  const progressCount = reviewStep + 1;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.stepHeader}>
          {step > 0 ? (
            <Pressable style={styles.backBtn} onPress={() => setStep((s) => Math.max(0, s - 1))}>
              <Feather name="arrow-left" size={16} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}
          <View style={styles.progressWrap}>
            <View style={styles.progressRow}>
              {steps.slice(0, progressCount).map((_, i) => (
                <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? primary : colors.muted }]} />
              ))}
            </View>
            <Text style={styles.stepMeta}>
              Step {step + 1} of {progressCount} — {steps[step]}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>
          {needsLocation && step === 0 && 'Choose a location'}
          {step === serviceStep && 'Select services'}
          {step === stylistStep && 'Choose staff'}
          {step === scheduleStep && 'Pick a date & time'}
          {step === reviewStep && 'Review & confirm'}
        </Text>
      </View>

      <RefreshableScrollView
        contentContainerStyle={styles.body}
        refreshing={refreshing}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        {needsLocation && step === 0
          ? offices.map((office) => {
              const selected = selectedBranchId === office.id;
              return (
                <Pressable
                  key={office.id}
                  style={[styles.option, selected && { borderColor: primary, backgroundColor: `${primary}08` }]}
                  onPress={() => setSelectedBranchId(office.id)}
                >
                  <View style={[styles.thumb, { backgroundColor: `${primary}12` }]}>
                    <Feather name="map-pin" size={18} color={primary} />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{office.display_name}</Text>
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

        {step === stylistStep && (
          <>
            {requiresMultipleSpecialists ? (
              <Card>
                <Text style={styles.optionTitle}>We'll assign the right specialists</Text>
                <Text style={styles.optionMeta}>
                  Your selected services may involve multiple team members. We'll assign the best
                  available staff for each service.
                </Text>
              </Card>
            ) : (
              <>
            <Pressable
              style={[
                styles.staffOption,
                selectedStaffId === '' && { borderColor: primary, backgroundColor: `${primary}08` },
              ]}
              onPress={() => setSelectedStaffId('')}
            >
              <Avatar name="Any" size="md" />
              <View style={styles.optionBody}>
                <Text style={styles.optionTitle}>Any available</Text>
                <Text style={styles.optionMeta}>We’ll assign the next available staff member</Text>
              </View>
              <View style={[styles.radio, selectedStaffId === '' && { borderColor: primary, backgroundColor: primary }]}>
                {selectedStaffId === '' ? <Feather name="check" size={12} color="#fff" /> : null}
              </View>
            </Pressable>
            {commonStaff.map((member) => {
              const selected = selectedStaffId === member.id;
              return (
                <Pressable
                  key={member.id}
                  style={[styles.staffOption, selected && { borderColor: primary, backgroundColor: `${primary}08` }]}
                  onPress={() => setSelectedStaffId(member.id)}
                >
                  <Avatar name={member.display_name} size="md" />
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{member.display_name}</Text>
                    <Text style={styles.optionMeta}>{member.designation}</Text>
                  </View>
                  <View style={[styles.radio, selected && { borderColor: primary, backgroundColor: primary }]}>
                    {selected ? <Feather name="check" size={12} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })}
              </>
            )}
          </>
        )}

        {step === scheduleStep && (
          <>
            <CalendarPicker value={date} onChange={setDate} primaryColor={primary} />
            <Text style={styles.sectionLabel}>
              Available times {stylistLabel ? `with ${stylistLabel}` : ''}
            </Text>
            <View style={styles.slotGrid}>
              {slots.map((slot) => {
                const selected = selectedSlot === slot.start_at;
                return (
                  <Pressable
                    key={slot.start_at}
                    style={[styles.slot, selected && { backgroundColor: primary, borderColor: primary }]}
                    onPress={() => setSelectedSlot(slot.start_at)}
                  >
                    <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                      {formatTime(slot.start_at)}
                    </Text>
                  </Pressable>
                );
              })}
              {!loading && !slots.length ? (
                <Text style={styles.optionMeta}>
                  {availabilityMessage || 'No timeslot available for this date. Try another day or staff member.'}
                </Text>
              ) : null}
              {loading ? <Text style={styles.optionMeta}>Loading available times...</Text> : null}
            </View>
          </>
        )}

        {step === reviewStep && selectedServices.length ? (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Visit timeline</Text>
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
                    <Text style={styles.timelineTime}>
                      {itemStart && itemEnd
                        ? `${formatTime(itemStart.toISOString())} – ${formatTime(itemEnd.toISOString())}`
                        : `${service.duration_minutes} min`}
                    </Text>
                    <View style={styles.timelineBody}>
                      <Text style={styles.optionTitle}>{service.name}</Text>
                      <Text style={styles.optionMeta}>
                        {requiresMultipleSpecialists ? 'Specialist assigned at booking' : stylistLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
            <Card>
              <Text style={styles.sectionLabel}>Booking Summary</Text>
              <SummaryRow label="Services" value={serviceSummaryLabel} />
              <SummaryRow label="Staff" value={stylistLabel} />
              <SummaryRow label="Date" value={new Date(selectedSlot).toLocaleDateString()} />
              <SummaryRow label="Time" value={formatTime(selectedSlot)} />
              <SummaryRow label="Duration" value={`${totalDurationMinutes} minutes`} />
              {pointsToRedeem > 0 ? (
                <SummaryRow
                  label="Points discount"
                  value={`-${formatMoney(redeemDiscount, bookingCurrency)} (${pointsToRedeem} pts)`}
                />
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.totalValue, { color: primary }]}>
                  {formatMoney(Math.max(0, totalPrice - redeemDiscount), bookingCurrency)}
                </Text>
              </View>
              {bookingEarnPoints > 0 ? (
                <Text style={styles.earnHint}>
                  You'll earn {bookingEarnPoints} pts after this visit is completed.
                </Text>
              ) : null}
            </Card>
            {loyaltyEnabled ? (
              <Card>
                <Text style={styles.sectionLabel}>Use reward points</Text>
                <Text style={styles.optionMeta}>
                  Balance {loyaltyBalance} pts · {pointsPerCurrency} pts = {formatMoney(1, bookingCurrency)}
                </Text>
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
                      <Text style={styles.optionMeta}>
                        Saves {formatMoney(redeemDiscount, bookingCurrency)}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.optionMeta}>
                    Earn points on completed visits. You need at least {minRedeemPoints} pts to redeem.
                  </Text>
                )}
              </Card>
            ) : null}
            <Card>
              <Text style={styles.sectionLabel}>Location</Text>
              <Text style={styles.locationName}>
                {selectedOffice?.display_name ?? bootstrap?.business.display_name ?? branding?.appName}
              </Text>
              {(selectedOffice?.formatted_address || bootstrap?.business.formatted_address) ? (
                <Text style={styles.optionMeta}>
                  {selectedOffice?.formatted_address || bootstrap?.business.formatted_address}
                </Text>
              ) : null}
            </Card>
            {bootstrap?.business.cancellation_policy ? (
              <Card>
                <Text style={styles.sectionLabel}>Cancellation Policy</Text>
                <Text style={styles.policyText}>{bootstrap.business.cancellation_policy}</Text>
              </Card>
            ) : null}
            <Input
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Any preferences for your visit"
              multiline
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </RefreshableScrollView>

      <View style={[styles.footer, { paddingBottom: contentInset }]}>
        {step === serviceStep && selectedServices.length > 0 ? (
          <View style={styles.cartBar}>
            <View>
              <Text style={styles.cartTitle}>
                {selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected
              </Text>
              <Text style={styles.cartSubtitle}>{totalDurationMinutes} min visit</Text>
            </View>
            <Text style={[styles.cartPrice, { color: primary }]}>
              {formatMoney(totalPrice, bookingCurrency)}
            </Text>
          </View>
        ) : null}
        <Button
          label={step === reviewStep ? 'Confirm Booking' : 'Continue'}
          size="lg"
          fullWidth
          loading={loading}
          primaryColor={primary}
          onPress={nextStep}
        />
      </View>
    </View>
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
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: { width: 32 },
  progressWrap: { flex: 1 },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  stepMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  title: { ...typography.heading, fontSize: 20, color: colors.foreground },
  body: { padding: spacing.xl, gap: spacing.md },
  categoryBlock: { gap: spacing.sm, marginBottom: spacing.md },
  categoryLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
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
  staffOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  staffIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1 },
  optionTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  optionMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  optionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  optionPrice: { ...typography.label, fontWeight: '700', color: colors.foreground },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshSlots: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  refreshText: { ...typography.caption, fontWeight: '600' },
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    width: '30%',
    minWidth: 96,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  slotText: { ...typography.label, color: colors.foreground },
  slotTextSelected: { color: '#fff' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { ...typography.body, color: colors.mutedForeground },
  summaryValue: { ...typography.body, color: colors.foreground, fontWeight: '600' },
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
  redeemValue: { ...typography.label, fontWeight: '700', color: colors.foreground, minWidth: 80, textAlign: 'center' },
  locationName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  policyText: { ...typography.caption, color: colors.mutedForeground, lineHeight: 20 },
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
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  cartSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  cartPrice: { ...typography.label, fontWeight: '800' },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  timelineTime: { ...typography.caption, color: colors.mutedForeground, width: 108 },
  timelineBody: { flex: 1 },
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
  confirmServiceMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
