import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { BookingReviewSummary, MobileBooking, MobileBookingInvoice } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { CalendarPicker } from '../../components/CalendarPicker';
import { BookingVisitActions } from '../../components/BookingVisitActions';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { ImageLightbox } from '../../components/ImageLightbox';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { withAlpha } from '../../theme/colorUtils';
import {
  filterFutureSlots,
  formatDateKey,
  formatDateTime,
  formatMoney,
  formatTime,
  mapBookingStatus,
} from '../../utils/format';
import {
  bookingDirectionsUrl,
  bookingServiceLabel,
  bookingStaffLabel,
  bookingStaffNames,
} from '../../utils/bookingDisplay';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';

function resolveBookingProofUrl(booking: MobileBooking): string {
  const mediaId = String(booking.payment_proof_media_id || '').trim();
  if (mediaId) return resolveMediaUrl(`/api/v1/media/${mediaId}/file`);
  return resolveMediaUrl(booking.payment_proof_url);
}

export function BookingDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const toast = useToast();
  const primary = branding?.primaryColor ?? colors.primary;
  const businessPhone = bootstrap?.business.phone?.trim() || '';

  const [booking, setBooking] = useState<MobileBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [date, setDate] = useState(() => formatDateKey(new Date()));
  const [slots, setSlots] = useState<Array<{ start_at: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slotError, setSlotError] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [review, setReview] = useState<BookingReviewSummary | null>(null);
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);

  const loadBooking = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!tenantSlug || !businessCode) return;
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      try {
        const response = await mobileClient.mobile.getBooking(route.params.bookingId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setBooking(response.data);
        if (response.data.review) {
          setReview(response.data.review);
        } else {
          const reviews = await mobileClient.mobile.listMyReviews({
            tenant_slug: tenantSlug,
            business_code: businessCode,
          });
          const existing = reviews.data.find((item) => item.booking_id === route.params.bookingId);
          setReview(
            existing
              ? {
                  id: existing.id,
                  rating: existing.rating,
                  comment: existing.comment,
                  created_at: existing.created_at,
                }
              : null,
          );
        }
      } catch {
        if (!silent) {
          setBooking(null);
          setReview(null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tenantSlug, businessCode, route.params.bookingId],
  );

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await loadBooking({ silent: true });
  });

  async function onSubmitReview() {
    if (!booking || !tenantSlug || !businessCode) return;
    setActionLoading(true);
    try {
      const created = await mobileClient.mobile.createReview(booking.id, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
        rating,
        comment: reviewComment.trim() || undefined,
      });
      setReview({
        id: created.data.id,
        rating: created.data.rating,
        comment: created.data.comment,
        created_at: created.data.created_at,
      });
      setBooking((current) =>
        current
          ? {
              ...current,
              review: {
                id: created.data.id,
                rating: created.data.rating,
                comment: created.data.comment,
                created_at: created.data.created_at,
              },
            }
          : current,
      );
      toast.push('Review submitted.', 'success');
    } catch (err) {
      Alert.alert('Unable to submit review', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    void loadBooking();
  }, [loadBooking]);

  const canManage = booking && ['pending', 'confirmed', 'rescheduled'].includes(booking.status);

  async function loadSlots() {
    if (!booking || !tenantSlug || !businessCode) return;
    const serviceIds =
      booking.items && booking.items.length > 1
        ? booking.items.map((item) => item.service_id)
        : undefined;
    const response = await mobileClient.mobile.availability({
      tenant_slug: tenantSlug,
      business_code: businessCode,
      date,
      duration_minutes: serviceIds ? undefined : booking.duration_minutes,
      staff_id: booking.staff_id || undefined,
      service_id: serviceIds ? undefined : booking.service_id,
      service_ids: serviceIds,
    });
    const openSlots = filterFutureSlots(response.data.slots);
    setSlots(openSlots);
    setSelectedSlot('');
    if (!openSlots.length) {
      Alert.alert(
        'No timeslot available',
        response.data.message || 'No timeslot available for this date. Try another day.',
      );
    }
  }

  async function onReschedule() {
    if (!booking || !tenantSlug || !businessCode) return;
    if (!selectedSlot) {
      setSlotError('Select an available time slot.');
      return;
    }
    setSlotError('');
    setActionLoading(true);
    try {
      const response = await mobileClient.mobile.rescheduleBooking(booking.id, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
        start_at: selectedSlot,
        reason: 'Rescheduled by customer from mobile app',
      });
      setBooking(response.data);
      setRescheduleMode(false);
      toast.push('Appointment updated.', 'success');
    } catch (err) {
      Alert.alert('Unable to reschedule', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function onCancel() {
    if (!booking || !tenantSlug || !businessCode) return;
    Alert.alert('Cancel appointment', 'Are you sure you want to cancel this booking?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            const response = await mobileClient.mobile.cancelBooking(booking.id, {
              tenant_slug: tenantSlug,
              business_code: businessCode,
              reason: 'Cancelled by customer from mobile app',
            });
            setBooking(response.data);
          } catch (err) {
            Alert.alert('Unable to cancel', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  function invoiceViewUrl(invoice: MobileBookingInvoice): string {
    const token = String(invoice.token || '').trim();
    if (token) {
      return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(token)}?format=html`;
    }
    const raw = String(invoice.view_url || invoice.public_url || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/')) return `${getApiBaseUrl().replace(/\/api\/v1\/?$/, '')}${raw}`;
    if (raw.includes('/public/shop-docs/') && !raw.includes('format=')) {
      return `${raw}${raw.includes('?') ? '&' : '?'}format=html`;
    }
    return raw;
  }

  async function fetchBookingInvoice(): Promise<MobileBookingInvoice | null> {
    const response = await mobileClient.mobile.getBookingInvoice(route.params.bookingId, {
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    return response.data;
  }

  async function openInvoiceUrl(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('Cannot open invoice link on this device');
      await Linking.openURL(url);
    }
  }

  async function viewInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchBookingInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || 'Tax invoice is not available yet.', 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      if (!url) {
        toast.push('Could not open tax invoice.', 'error');
        return;
      }
      await openInvoiceUrl(url);
      // Refresh booking so books_voucher_id appears after lazy post.
      await loadBooking();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not open tax invoice.', 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function shareInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchBookingInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || 'Tax invoice is not available yet.', 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      const text = String(invoice.message || '').trim();
      const message = text.includes('http') ? text : [text, url].filter(Boolean).join('\n');
      if (!message) {
        toast.push('Could not prepare invoice share link.', 'error');
        return;
      }
      await Share.share({ message, url: url || undefined });
      await loadBooking();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not share tax invoice.', 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  if (loading && !booking) {
    return (
      <ProfileMenuScreen title="Appointment" onBack={() => navigation.goBack()} primaryColor={primary}>
        <ActivityIndicator color={primary} />
      </ProfileMenuScreen>
    );
  }

  if (!booking) {
    return (
      <ProfileMenuScreen
        title="Appointment"
        onBack={() => navigation.goBack()}
        primaryColor={primary}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <Text style={styles.empty}>Booking not found.</Text>
      </ProfileMenuScreen>
    );
  }

  const serviceName = bookingServiceLabel(booking);
  const staffLabel = bookingStaffLabel(booking);
  const staffNames = bookingStaffNames(booking);
  const directionsUrl = bookingDirectionsUrl(booking.branch);
  const hasVisitActions = Boolean(directionsUrl || businessPhone);
  const showStaffSummary = staffLabel && (staffNames.length > 1 || !booking.items?.length);
  const currency = bootstrap?.business.currency || 'INR';
  const loyaltyEnabled = Boolean(bootstrap?.loyalty?.enabled);
  const loyalty = booking.loyalty;
  const pointsRedeemed = loyaltyEnabled ? Math.max(0, Number(loyalty?.points_redeemed) || 0) : 0;
  const pointsEarned = loyaltyEnabled ? Math.max(0, Number(loyalty?.points_earned) || 0) : 0;
  const pointsPending = loyaltyEnabled ? Math.max(0, Number(loyalty?.points_pending) || 0) : 0;
  const pointsDiscount = loyaltyEnabled ? Number(loyalty?.discount_amount) || 0 : 0;
  const loyaltyCurrency = loyalty?.currency || currency;
  const lineTotal = (booking.items ?? []).reduce(
    (sum, item) => sum + (Number(item.price_snapshot) || 0),
    0,
  );
  const amountLabel = formatMoney(lineTotal > 0 ? lineTotal : null, currency);
  const showLoyaltyCard =
    loyaltyEnabled && (pointsRedeemed > 0 || pointsEarned > 0 || pointsPending > 0 || pointsDiscount > 0);
  const invoiceVoucherId = String(booking.books_voucher_id || '').trim();
  const invoiceNumber = String(booking.books_voucher_number || booking.booking_number || '').trim();
  const showInvoicePending = booking.status !== 'completed' && booking.status !== 'cancelled';
  const paymentProofUri = resolveBookingProofUrl(booking);
  const paymentMethodLabel = (() => {
    const method = String(booking.payment_method || '').trim().toLowerCase();
    if (!method) return '';
    if (method === 'borrow') return 'Credit';
    return method.charAt(0).toUpperCase() + method.slice(1);
  })();
  const highlightPoints = pointsEarned > 0 ? pointsEarned : pointsPending;
  const highlightTitle =
    pointsEarned > 0
      ? 'Rewards unlocked'
      : pointsPending > 0
        ? 'Earn on this visit'
        : pointsRedeemed > 0
          ? 'Rewards applied'
          : 'Reward points';
  const highlightSubtitle =
    pointsEarned > 0
      ? 'Added to your balance after this appointment was completed.'
      : pointsPending > 0
        ? 'Complete your visit to credit these points to your balance.'
        : pointsRedeemed > 0
          ? 'You saved with reward points on this booking.'
          : '';

  const stickyFooter =
    canManage && !rescheduleMode ? (
      <View style={styles.footerRow}>
        <Button
          label="Reschedule"
          icon="calendar"
          fullWidth
          primaryColor={primary}
          style={styles.footerBtn}
          onPress={() => setRescheduleMode(true)}
        />
        <Button
          label="Cancel"
          icon="x-circle"
          variant="destructive"
          loading={actionLoading}
          fullWidth
          style={styles.footerBtn}
          onPress={onCancel}
        />
      </View>
    ) : rescheduleMode ? (
      <View style={styles.footerRow}>
        <Button
          label="Back"
          icon="arrow-left"
          variant="outline"
          fullWidth
          style={styles.footerBtn}
          onPress={() => setRescheduleMode(false)}
        />
        <Button
          label="Confirm"
          icon="check"
          fullWidth
          loading={actionLoading}
          primaryColor={primary}
          style={styles.footerPrimary}
          onPress={onReschedule}
        />
      </View>
    ) : null;

  return (
    <ProfileMenuScreen
      title="Appointment"
      onBack={() => navigation.goBack()}
      primaryColor={primary}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={stickyFooter}
    >
      <Card>
        <View style={styles.row}>
          <Text style={styles.service}>{serviceName}</Text>
          <Badge status={mapBookingStatus(booking.status)} />
        </View>
        <DetailRow label="Reference" value={`#${booking.booking_number}`} />
        <DetailRow label="Starts" value={formatDateTime(booking.start_at)} />
        {booking.end_at ? <DetailRow label="Ends" value={formatDateTime(booking.end_at)} /> : null}
        <DetailRow label="Duration" value={`${booking.duration_minutes} minutes`} />
        {booking.items && booking.items.length > 0 ? (
          <View style={styles.itemsBlock}>
            <Text style={styles.itemsLabel}>Services</Text>
            {booking.items.map((item) => {
              const lineAmount = Number(item.price_snapshot) || 0;
              return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemName}>{item.service_name || 'Service'}</Text>
                    {lineAmount > 0 ? (
                      <Text style={styles.itemPrice}>{formatMoney(lineAmount, currency)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.itemMeta}>
                    {formatTime(item.start_at)} · {item.duration_minutes} min
                    {item.staff_name ? ` · with ${item.staff_name}` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {showStaffSummary ? <DetailRow label="Staff" value={staffLabel} /> : null}
        {amountLabel !== '—' ? <DetailRow label="Amount" value={amountLabel} /> : null}
        <DetailRow
          label="Payment"
          value={
            paymentMethodLabel
              ? paymentMethodLabel
              : booking.payment_mode === 'pay_at_venue' || !booking.payment_mode
                ? 'Pay at venue'
                : booking.payment_mode
          }
        />
        {paymentProofUri ? (
          <View style={styles.proofBlock}>
            <Text style={styles.section}>Payment proof</Text>
            <Pressable onPress={() => setProofLightboxOpen(true)} accessibilityLabel="View payment proof">
              <Image source={{ uri: paymentProofUri }} style={styles.proofImage} resizeMode="cover" />
            </Pressable>
            <Text style={styles.locationAddress}>Tap to view full size</Text>
          </View>
        ) : null}
        {booking.notes ? <DetailRow label="Notes" value={booking.notes} multiline /> : null}
      </Card>

      {showLoyaltyCard ? (
        <View style={[styles.loyaltyBanner, { backgroundColor: withAlpha(primary, 0.1), borderColor: withAlpha(primary, 0.28) }]}>
          <View style={[styles.loyaltyIconWrap, { backgroundColor: withAlpha(primary, 0.18) }]}>
            <Feather name="award" size={22} color={primary} />
          </View>
          <View style={styles.loyaltyCopy}>
            <Text style={[styles.loyaltyEyebrow, { color: primary }]}>{highlightTitle}</Text>
            {highlightPoints > 0 ? (
              <Text style={styles.loyaltyPoints}>
                {highlightPoints}{' '}
                <Text style={styles.loyaltyPointsUnit}>pts</Text>
              </Text>
            ) : null}
            {highlightSubtitle ? <Text style={styles.loyaltySubtitle}>{highlightSubtitle}</Text> : null}
            {(pointsRedeemed > 0 || pointsDiscount > 0) && (pointsEarned > 0 || pointsPending > 0) ? (
              <View style={styles.loyaltyMetaRow}>
                {pointsRedeemed > 0 ? (
                  <View style={[styles.loyaltyChip, { backgroundColor: withAlpha(primary, 0.12) }]}>
                    <Text style={[styles.loyaltyChipText, { color: primary }]}>Used {pointsRedeemed} pts</Text>
                  </View>
                ) : null}
                {pointsDiscount > 0 ? (
                  <View style={[styles.loyaltyChip, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.loyaltyChipText, { color: '#047857' }]}>
                      Saved {formatMoney(pointsDiscount, loyaltyCurrency)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {pointsRedeemed > 0 && highlightPoints <= 0 ? (
              <View style={styles.loyaltyMetaRow}>
                <View style={[styles.loyaltyChip, { backgroundColor: withAlpha(primary, 0.12) }]}>
                  <Text style={[styles.loyaltyChipText, { color: primary }]}>Used {pointsRedeemed} pts</Text>
                </View>
                {pointsDiscount > 0 ? (
                  <View style={[styles.loyaltyChip, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.loyaltyChipText, { color: '#047857' }]}>
                      Saved {formatMoney(pointsDiscount, loyaltyCurrency)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {invoiceVoucherId || booking.status === 'completed' ? (
        <Card>
          <Text style={styles.section}>Tax invoice</Text>
          <Text style={styles.locationAddress}>
            {invoiceVoucherId
              ? invoiceNumber
                ? `Invoice ${invoiceNumber}`
                : 'GST tax invoice for this appointment'
              : 'Generating your tax invoice… Tap View to open it.'}
          </Text>
          <View style={styles.invoiceActionsRow}>
            <Pressable
              style={[
                styles.invoiceActionBtn,
                styles.invoiceActionPrimary,
                { backgroundColor: primary },
                invoiceBusy && { opacity: 0.6 },
              ]}
              disabled={invoiceBusy}
              onPress={() => void viewInvoice()}
            >
              <Text style={styles.invoiceActionPrimaryText}>
                {invoiceBusy ? 'Opening…' : 'View invoice'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.invoiceActionBtn,
                styles.invoiceActionSecondary,
                { borderColor: primary },
                invoiceBusy && { opacity: 0.6 },
              ]}
              disabled={invoiceBusy}
              onPress={() => void shareInvoice()}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>Share</Text>
            </Pressable>
          </View>
        </Card>
      ) : showInvoicePending ? (
        <Card>
          <Text style={styles.section}>Tax invoice</Text>
          <Text style={styles.locationAddress}>
            Tax invoice will appear here after this appointment is completed.
          </Text>
        </Card>
      ) : null}

      {booking.branch?.display_name || booking.branch?.formatted_address || hasVisitActions ? (
        <Card>
          <Text style={styles.section}>Visit location</Text>
          {booking.branch?.display_name ? (
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={16} color={primary} />
              <Text style={styles.locationTitle}>{booking.branch.display_name}</Text>
            </View>
          ) : null}
          {booking.branch?.formatted_address ? (
            <Text style={styles.locationAddress}>{booking.branch.formatted_address}</Text>
          ) : null}
          {hasVisitActions ? (
            <BookingVisitActions
              directionsUrl={directionsUrl}
              phone={businessPhone}
              primaryColor={primary}
            />
          ) : null}
        </Card>
      ) : null}

      {review ? (
        <Card>
          <Text style={styles.section}>Your review</Text>
          <Text style={[styles.ratingStars, { color: primary }]}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </Text>
          <Text style={styles.reviewComment}>{review.comment?.trim() || 'No written comment.'}</Text>
          {review.created_at ? <Text style={styles.reviewMeta}>{formatDateTime(review.created_at)}</Text> : null}
        </Card>
      ) : null}

      {booking.status === 'completed' && !review ? (
        <Card>
          <Text style={styles.section}>Leave a review</Text>
          <View style={styles.reviewForm}>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setRating(value)} hitSlop={6}>
                  <Text style={[styles.star, { color: value <= rating ? primary : colors.mutedForeground }]}>
                    {value <= rating ? '★' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input
              label="Comment (optional)"
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="How was your visit?"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={styles.reviewInput}
            />
            <Button
              label="Submit review"
              icon="send"
              fullWidth
              loading={actionLoading}
              primaryColor={primary}
              onPress={() => void onSubmitReview()}
            />
          </View>
        </Card>
      ) : null}

      {rescheduleMode ? (
        <Card>
          <Text style={styles.section}>Pick a new date & time</Text>
          <CalendarPicker value={date} onChange={setDate} primaryColor={primary} />
          <Button
            label="Load available times"
            icon="clock"
            variant="outline"
            fullWidth
            onPress={loadSlots}
          />
          {slots.map((slot) => (
            <Button
              key={slot.start_at}
              label={formatTime(slot.start_at)}
              icon={null}
              variant={selectedSlot === slot.start_at ? 'primary' : 'outline'}
              fullWidth
              primaryColor={primary}
              onPress={() => {
                setSelectedSlot(slot.start_at);
                setSlotError('');
              }}
            />
          ))}
          {slotError ? <Text style={styles.error}>{slotError}</Text> : null}
        </Card>
      ) : null}
      <ImageLightbox
        uri={paymentProofUri || null}
        visible={proofLightboxOpen}
        title="Payment proof"
        onClose={() => setProofLightboxOpen(false)}
      />
    </ProfileMenuScreen>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValueBlock}>{value}</Text>
      </View>
    );
  }
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabelInline}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  service: { ...typography.title, color: colors.foreground, flex: 1, marginRight: spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  detailBlock: { marginBottom: spacing.sm, gap: 4 },
  detailLabel: { ...typography.body, color: colors.mutedForeground },
  detailLabelInline: { ...typography.body, color: colors.mutedForeground, flexShrink: 0 },
  detailValue: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  detailValueBlock: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
    lineHeight: 20,
    flexShrink: 1,
  },
  itemsBlock: { marginBottom: spacing.sm },
  itemsLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', marginBottom: spacing.xs },
  itemRow: { marginBottom: spacing.sm },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  itemName: { ...typography.body, color: colors.foreground, fontWeight: '600', flex: 1 },
  itemPrice: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  itemMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  locationTitle: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  locationAddress: {
    ...typography.body,
    color: colors.mutedForeground,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  empty: { ...typography.body, color: colors.mutedForeground },
  section: { ...typography.label, color: colors.foreground, fontWeight: '700', marginBottom: spacing.md },
  proofBlock: { marginTop: spacing.md, gap: spacing.sm },
  proofImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loyaltyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  loyaltyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyCopy: { flex: 1, gap: 4 },
  loyaltyEyebrow: { ...typography.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  loyaltyPoints: { ...typography.heading, fontSize: 28, lineHeight: 34, color: colors.foreground, fontWeight: '800' },
  loyaltyPointsUnit: { fontSize: 16, fontWeight: '700', color: colors.mutedForeground },
  loyaltySubtitle: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18, marginTop: 2 },
  loyaltyMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  loyaltyChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  loyaltyChipText: { ...typography.caption, fontWeight: '700' },
  invoiceActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  invoiceActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  invoiceActionPrimary: {},
  invoiceActionPrimaryText: { color: '#fff', fontWeight: '700' },
  invoiceActionSecondary: {
    borderWidth: 1,
    backgroundColor: colors.card,
  },
  reviewForm: { gap: spacing.lg },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 28 },
  reviewInput: { minHeight: 88, paddingTop: spacing.sm },
  ratingStars: { ...typography.title, fontSize: 22, letterSpacing: 1, marginBottom: spacing.sm },
  reviewComment: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  reviewMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.destructive },
  footerRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  footerBtn: { flex: 1, minWidth: 0 },
  footerPrimary: { flex: 1.4, minWidth: 0 },
});
