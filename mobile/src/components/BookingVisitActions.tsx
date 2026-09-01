import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  directionsUrl?: string | null;
  phone?: string | null;
  primaryColor?: string;
  variant?: 'card' | 'hero';
};

export function BookingVisitActions({
  directionsUrl,
  phone,
  primaryColor = colors.primary,
  variant = 'card',
}: Props) {
  const trimmedPhone = phone?.trim() || '';
  if (!directionsUrl && !trimmedPhone) return null;

  const isHero = variant === 'hero';
  const tileStyle = isHero ? styles.heroTile : styles.cardTile;
  const iconWrapStyle = isHero ? styles.heroIconWrap : [styles.cardIconWrap, { backgroundColor: `${primaryColor}14` }];
  const iconColor = isHero ? '#fff' : primaryColor;
  const labelStyle = isHero ? styles.heroLabel : [styles.cardLabel, { color: colors.foreground }];

  return (
    <View style={styles.row}>
      {directionsUrl ? (
        <Pressable
          style={({ pressed }) => [tileStyle, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation?.();
            void Linking.openURL(directionsUrl);
          }}
        >
          <View style={iconWrapStyle}>
            <Feather name="navigation" size={16} color={iconColor} />
          </View>
          <Text style={labelStyle}>Directions</Text>
        </Pressable>
      ) : null}
      {trimmedPhone ? (
        <Pressable
          style={({ pressed }) => [tileStyle, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation?.();
            void Linking.openURL(`tel:${trimmedPhone}`);
          }}
        >
          <View style={iconWrapStyle}>
            <Feather name="phone" size={16} color={iconColor} />
          </View>
          <Text style={labelStyle}>Call salon</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  heroTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cardLabel: { ...typography.caption, fontWeight: '700', textAlign: 'center' },
  heroLabel: { ...typography.caption, color: '#fff', fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.82 },
});
