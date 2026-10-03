import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Booking } from '@ie-orbit/sdk';
import { BookingRow } from './BookingRow';
import { HorizontalCarouselPanel } from './HorizontalCarouselPanel';
import { Button } from './ui/Button';
import {
  bookingCustomerLabel,
  bookingCustomerPhone,
  bookingPriceTotal,
  bookingServiceLabel,
  bookingStaffLabel,
} from '../utils/bookingDisplay';
import { formatMoney } from '../features/shop/posPayment';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme/tokens';

type Props = {
  bookings: Booking[];
  loading: boolean;
  serviceMap: Map<string, string>;
  customerMap: Map<string, string>;
  staffMap: Map<string, string>;
  currency?: string | null;
  onPressBooking: (bookingId: string) => void;
  onSeeAll: () => void;
  onCreateBooking: () => void;
  hideHeader?: boolean;
  hidePanelMargin?: boolean;
};

export function TodayBookingsPanel({
  bookings,
  loading,
  serviceMap,
  customerMap,
  staffMap,
  currency,
  onPressBooking,
  onSeeAll,
  onCreateBooking,
  hideHeader = false,
  hidePanelMargin = false,
}: Props) {
  return (
    <HorizontalCarouselPanel
      title="Upcoming today"
      count={bookings.length}
      loading={loading}
      onSeeAll={onSeeAll}
      hideHeader={hideHeader}
      hidePanelMargin={hidePanelMargin}
      getItemKey={(index) => bookings[index]?.id ?? String(index)}
      emptyState={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyLabel}>Upcoming today</Text>
          <Text style={styles.emptyTitle}>No upcoming bookings</Text>
          <Text style={styles.emptyHint}>Fill today&apos;s schedule with a new appointment.</Text>
          <Button label="New booking" size="sm" style={styles.emptyBtn} onPress={onCreateBooking} />
        </View>
      }
      renderItem={(index, activeIndex) => {
        const booking = bookings[index];
        if (!booking) return null;
        const total = bookingPriceTotal(booking);
        return (
          <BookingRow
            compact
            highlight={index === activeIndex}
            serviceName={bookingServiceLabel(booking, serviceMap)}
            customerName={bookingCustomerLabel(booking, customerMap)}
            customerPhone={bookingCustomerPhone(booking)}
            staffName={bookingStaffLabel(booking, staffMap)}
            startAt={booking.start_at}
            endAt={booking.end_at}
            durationMinutes={booking.duration_minutes}
            serviceCount={booking.line_items?.length || undefined}
            bookingNumber={booking.booking_number}
            status={booking.status}
            priceLabel={total > 0 ? formatMoney(total, currency) : undefined}
            onPress={() => onPressBooking(booking.id)}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  emptyLabel: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  emptyTitle: { ...typography.title, color: colors.foreground },
  emptyHint: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  emptyBtn: { alignSelf: 'flex-start', marginTop: spacing.md },
});
