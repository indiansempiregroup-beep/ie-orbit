import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MobileDiscoverService } from '@ie-platform/sdk';
import { mobileClient } from '../../api/client';
import { CalendarPicker } from '../../components/CalendarPicker';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useMobileStaff } from '../../hooks/useMobileStaff';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { MainTabParamList } from '../../navigation/types';

const STEPS = ['Service', 'Stylist', 'Date & Time', 'Review', 'Confirmed'];

export function BookingScreen() {
  const route = useRoute<RouteProp<MainTabParamList, 'Book'>>();
  const { user } = useAuth();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;

  const [step, setStep] = useState(0);
  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(route.params?.serviceId ?? null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );
  const { staff } = useMobileStaff(selectedServiceId);
  const selectedStaff = staff.find((member) => member.id === selectedStaffId) ?? null;

  const groupedServices = useMemo(() => {
    const groups = new Map<string, MobileDiscoverService[]>();
    for (const service of services) {
      const key = service.category_name || 'General';
      const list = groups.get(key) ?? [];
      list.push(service);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [services]);

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

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await loadServices();
    if (step === 2 && selectedServiceId && selectedStaffId) {
      await loadSlots(selectedStaffId, date, selectedService);
    }
  });

  useEffect(() => {
    void loadServices().catch(() => setServices([]));
  }, [loadServices]);

  useEffect(() => {
    if (route.params?.serviceId) setSelectedServiceId(route.params.serviceId);
  }, [route.params?.serviceId]);

  async function loadSlots(staffId: string, slotDate: string, service: MobileDiscoverService) {
    setLoading(true);
    setError('');
    try {
      const response = await mobileClient.mobile.availability({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        date: slotDate,
        duration_minutes: service.duration_minutes,
        staff_id: staffId,
      });
      setSlots(response.data.slots);
      setSelectedSlot('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability.');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    if (!selectedService || !selectedSlot) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Add your phone number in Profile before booking.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const bookingRequest = mobileClient.mobile.requestBooking({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        service_id: selectedService.id,
        staff_id: selectedStaffId!,
        customer_name: customerName.trim(),
        phone_number: customerPhone.trim(),
        email: customerEmail.trim() || undefined,
        start_at: selectedSlot,
        duration_minutes: selectedService.duration_minutes,
        notes: notes.trim() || undefined,
      });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Booking is taking too long. Please try again.')), 45000);
      });
      const response = await Promise.race([bookingRequest, timeout]);
      setBookingRef(response.data.booking_number || response.data.booking_id);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request booking.');
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    if (step === 0 && !selectedService) {
      setError('Select a service to continue.');
      return;
    }
    if (step === 1 && !selectedStaffId) {
      setError('Select a stylist to continue.');
      return;
    }
    if (step === 2 && !selectedSlot) {
      setError('Select a time slot to continue.');
      return;
    }
    setError('');
    if (step === 0) setStep(1);
    else if (step === 1) {
      if (selectedService && selectedStaffId) {
        void loadSlots(selectedStaffId, date, selectedService);
      }
      setStep(2);
    } else if (step === 2) setStep(3);
    else if (step === 3) void confirmBooking();
  }

  useEffect(() => {
    if (step !== 2 || !selectedService || !selectedStaffId) return;
    void loadSlots(selectedStaffId, date, selectedService);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, step, selectedServiceId, selectedStaffId]);

  if (step === 4) {
    return (
      <View style={styles.confirmRoot}>
        <View style={styles.confirmIcon}>
          <Feather name="check" size={36} color={colors.success} />
        </View>
        <Text style={styles.confirmTitle}>Booking Confirmed!</Text>
        <Text style={styles.confirmSubtitle}>Confirmation sent to {customerEmail || 'your email'}.</Text>
        <Card style={styles.summaryCard}>
          <SummaryRow label="Service" value={selectedService?.name ?? ''} />
          <SummaryRow label="Stylist" value={selectedStaff?.display_name ?? ''} />
          <SummaryRow label="Date" value={new Date(selectedSlot).toLocaleDateString()} />
          <SummaryRow label="Time" value={new Date(selectedSlot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          <SummaryRow label="Reference" value={bookingRef} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, { color: primary }]}>
              {selectedService?.currency} {selectedService?.price}
            </Text>
          </View>
        </Card>
        <Button label="Done" primaryColor={primary} onPress={() => setStep(0)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
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
              {STEPS.slice(0, 4).map((_, i) => (
                <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? primary : colors.muted }]} />
              ))}
            </View>
            <Text style={styles.stepMeta}>
              Step {step + 1} of 4 — {STEPS[step]}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>
          {step === 0 && 'Select a service'}
          {step === 1 && 'Choose your stylist'}
          {step === 2 && 'Pick a date & time'}
          {step === 3 && 'Review & confirm'}
        </Text>
      </View>

      <RefreshableScrollView
        contentContainerStyle={styles.body}
        refreshing={refreshing}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        {step === 0 &&
          groupedServices.map(([category, categoryServices]) => (
            <View key={category} style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>{category}</Text>
              {categoryServices.map((service) => {
                const selected = selectedServiceId === service.id;
                return (
                  <Pressable
                    key={service.id}
                    style={[styles.option, selected && { borderColor: primary, backgroundColor: `${primary}08` }]}
                    onPress={() => setSelectedServiceId(service.id)}
                  >
                    {service.image_url ? (
                      <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: `${primary}12` }]}>
                        <Feather name="scissors" size={18} color={primary} />
                      </View>
                    )}
                    <View style={styles.optionBody}>
                      <Text style={styles.optionTitle}>{service.name}</Text>
                      <Text style={styles.optionMeta}>{service.duration_minutes} min</Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionPrice}>
                        {service.currency} {service.price}
                      </Text>
                      <View style={[styles.radio, selected && { borderColor: primary, backgroundColor: primary }]}>
                        {selected ? <Feather name="check" size={12} color="#fff" /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

        {step === 1 && (
          <>
            {staff.map((member) => {
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

        {step === 2 && (
          <>
            <CalendarPicker value={date} onChange={setDate} primaryColor={primary} />
            <Text style={styles.sectionLabel}>
              Available times {selectedStaff ? `with ${selectedStaff.display_name}` : ''}
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
                      {new Date(slot.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </Pressable>
                );
              })}
              {!loading && !slots.length ? (
                <Text style={styles.optionMeta}>No slots for this stylist on this date. Try another day.</Text>
              ) : null}
              {loading ? <Text style={styles.optionMeta}>Loading available times...</Text> : null}
            </View>
          </>
        )}

        {step === 3 && selectedService ? (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Booking Summary</Text>
              <SummaryRow label="Service" value={selectedService.name} />
              <SummaryRow label="Stylist" value={selectedStaff?.display_name ?? ''} />
              <SummaryRow label="Date" value={new Date(selectedSlot).toLocaleDateString()} />
              <SummaryRow label="Time" value={new Date(selectedSlot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
              <SummaryRow label="Duration" value={`${selectedService.duration_minutes} minutes`} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.totalValue, { color: primary }]}>
                  {selectedService.currency} {selectedService.price}
                </Text>
              </View>
            </Card>
            <Card>
              <Text style={styles.sectionLabel}>Location</Text>
              <Text style={styles.locationName}>{bootstrap?.business.display_name ?? branding?.appName}</Text>
              {bootstrap?.business.formatted_address ? (
                <Text style={styles.optionMeta}>{bootstrap.business.formatted_address}</Text>
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

      <View style={styles.footer}>
        <Button
          label={step === 3 ? 'Confirm Booking' : 'Continue'}
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
    paddingTop: 56,
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
  body: { padding: spacing.xl, gap: spacing.md, paddingBottom: 120 },
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
  locationName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  policyText: { ...typography.caption, color: colors.mutedForeground, lineHeight: 20 },
  error: { ...typography.caption, color: colors.destructive },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
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
});
