import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { BookingReviewSummary, MobileBooking } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { CalendarPicker } from '../../components/CalendarPicker';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, spacing, typography } from '../../theme/tokens';
import { filterFutureSlots, formatDateKey, formatDateTime, formatTime, mapBookingStatus } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';

export function BookingDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;

  const [booking, setBooking] = useState<MobileBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [date, setDate] = useState(() => formatDateKey(new Date()));
  const [slots, setSlots] = useState<Array<{ start_at: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [review, setReview] = useState<BookingReviewSummary | null>(null);

  async function loadBooking() {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
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
      setBooking(null);
      setReview(null);
    } finally {
      setLoading(false);
    }
  }

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
      Alert.alert('Thanks!', 'Your review has been submitted.');
    } catch (err) {
      Alert.alert('Unable to submit review', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    void loadBooking();
  }, [tenantSlug, businessCode, route.params.bookingId]);

  const canManage = booking && ['pending', 'confirmed', 'rescheduled'].includes(booking.status);

  async function loadSlots() {
    if (!booking || !tenantSlug || !businessCode) return;
    const response = await mobileClient.mobile.availability({
      tenant_slug: tenantSlug,
      business_code: businessCode,
      date,
      duration_minutes: booking.duration_minutes,
      staff_id: booking.staff_id || undefined,
      service_id: booking.service_id,
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
    if (!booking || !tenantSlug || !businessCode || !selectedSlot) return;
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
      Alert.alert('Rescheduled', 'Your appointment has been updated.');
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

  if (loading) {
    return (
      <ProfileMenuScreen title="Appointment" onBack={() => navigation.goBack()}>
        <ActivityIndicator color={primary} />
      </ProfileMenuScreen>
    );
  }

  if (!booking) {
    return (
      <ProfileMenuScreen title="Appointment" onBack={() => navigation.goBack()}>
        <Text style={styles.empty}>Booking not found.</Text>
      </ProfileMenuScreen>
    );
  }

  return (
    <ProfileMenuScreen title="Appointment" onBack={() => navigation.goBack()}>
      <Card>
        <View style={styles.row}>
          <Text style={styles.service}>{booking.service_name}</Text>
          <Badge status={mapBookingStatus(booking.status)} />
        </View>
        <DetailRow label="Reference" value={`#${booking.booking_number}`} />
        <DetailRow label="Date" value={new Date(booking.start_at).toLocaleDateString()} />
        <DetailRow
          label="Time"
          value={formatTime(booking.start_at)}
        />
        <DetailRow label="Duration" value={`${booking.duration_minutes} minutes`} />
        {booking.staff_name ? <DetailRow label="Staff" value={booking.staff_name} /> : null}
        {booking.branch?.display_name ? (
          <DetailRow label="Office" value={booking.branch.display_name} />
        ) : null}
        {booking.branch?.formatted_address ? (
          <DetailRow label="Address" value={booking.branch.formatted_address} />
        ) : null}
        <DetailRow
          label="Payment"
          value={booking.payment_mode === 'pay_at_venue' || !booking.payment_mode ? 'Pay at venue' : booking.payment_mode}
        />
        {booking.notes ? <DetailRow label="Notes" value={booking.notes} /> : null}
        {booking.branch && (booking.branch.latitude != null || booking.branch.formatted_address) ? (
          <Button
            label="Get directions"
            variant="outline"
            fullWidth
            primaryColor={primary}
            onPress={() => {
              const { latitude, longitude, formatted_address } = booking.branch!;
              const url =
                latitude != null && longitude != null
                  ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      formatted_address || booking.branch!.display_name,
                    )}`;
              void Linking.openURL(url);
            }}
          />
        ) : null}
      </Card>

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
          <Button label="Load available times" variant="outline" fullWidth onPress={loadSlots} />
          {slots.map((slot) => (
            <Button
              key={slot.start_at}
              label={formatTime(slot.start_at)}
              variant={selectedSlot === slot.start_at ? 'primary' : 'outline'}
              fullWidth
              primaryColor={primary}
              onPress={() => setSelectedSlot(slot.start_at)}
            />
          ))}
          <Button
            label="Confirm reschedule"
            fullWidth
            loading={actionLoading}
            primaryColor={primary}
            onPress={onReschedule}
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setRescheduleMode(false)} />
        </Card>
      ) : null}

      {canManage && !rescheduleMode ? (
        <>
          <Button label="Reschedule appointment" fullWidth primaryColor={primary} onPress={() => setRescheduleMode(true)} />
          <Button label="Cancel appointment" variant="destructive" loading={actionLoading} fullWidth onPress={onCancel} />
        </>
      ) : null}
    </ProfileMenuScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  service: { ...typography.title, color: colors.foreground, flex: 1, marginRight: spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  detailLabel: { ...typography.body, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  empty: { ...typography.body, color: colors.mutedForeground },
  section: { ...typography.label, color: colors.foreground, fontWeight: '700', marginBottom: spacing.md },
  reviewForm: { gap: spacing.lg },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 28 },
  reviewInput: { minHeight: 88, paddingTop: spacing.sm },
  ratingStars: { ...typography.title, fontSize: 22, letterSpacing: 1, marginBottom: spacing.sm },
  reviewComment: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  reviewMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
});
