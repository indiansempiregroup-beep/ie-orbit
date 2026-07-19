import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Badge } from './ui/Badge';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatDateTime, mapBookingStatus } from '../utils/format';

type Props = {
  serviceName: string;
  customerName?: string;
  staffName?: string;
  startAt?: string | null;
  bookingNumber?: string | null;
  status?: string | null;
  onPress?: () => void;
};

export function BookingRow({
  serviceName,
  customerName,
  staffName,
  startAt,
  bookingNumber,
  status,
  onPress,
}: Props) {
  const content = (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Feather name="calendar" size={16} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {serviceName}
        </Text>
        <Text style={styles.meta}>{formatDateTime(startAt)}</Text>
        {customerName ? <Text style={styles.meta}>Customer · {customerName}</Text> : null}
        {staffName ? <Text style={styles.staff}>with {staffName}</Text> : null}
        {bookingNumber ? <Text style={styles.ref}>#{bookingNumber}</Text> : null}
      </View>
      <Badge status={mapBookingStatus(status ?? 'pending')} />
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
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  staff: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  ref: { ...typography.tiny, color: colors.mutedForeground, marginTop: 4 },
});
