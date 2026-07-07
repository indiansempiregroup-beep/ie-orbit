import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileBooking } from '@ie-platform/sdk';
import { Badge } from './ui/Badge';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { mapBookingStatus } from '../utils/format';

type Props = {
  booking: MobileBooking;
  onPress?: () => void;
  primaryColor?: string;
};

export function BookingCard({ booking, onPress, primaryColor = colors.primary }: Props) {
  const content = (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: `${primaryColor}14` }]}>
        <Feather name="scissors" size={16} color={primaryColor} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{booking.service_name}</Text>
        <Text style={styles.meta}>
          {new Date(booking.start_at).toLocaleDateString()} ·{' '}
          {new Date(booking.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {booking.staff_name ? <Text style={styles.staff}>with {booking.staff_name}</Text> : null}
        <Text style={styles.ref}>#{booking.booking_number}</Text>
      </View>
      <Badge status={mapBookingStatus(booking.status)} />
    </View>
  );

  if (onPress) return <Pressable onPress={onPress}>{content}</Pressable>;
  return content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  staff: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  ref: { ...typography.tiny, color: colors.mutedForeground, marginTop: 4 },
});
