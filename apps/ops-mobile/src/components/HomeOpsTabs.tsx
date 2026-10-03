import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

export type HomeOpsTab = 'bookings' | 'orders';

type Props = {
  bookingsCount: number;
  ordersCount: number;
  bookingsPanel: React.ReactNode;
  ordersPanel: React.ReactNode;
};

function defaultTab(bookingsCount: number, ordersCount: number): HomeOpsTab {
  if (bookingsCount > 0) return 'bookings';
  if (ordersCount > 0) return 'orders';
  return 'bookings';
}

export function HomeOpsTabs({ bookingsCount, ordersCount, bookingsPanel, ordersPanel }: Props) {
  const [activeTab, setActiveTab] = useState<HomeOpsTab>(() => defaultTab(bookingsCount, ordersCount));

  useEffect(() => {
    setActiveTab((current) => {
      if (current === 'bookings' && bookingsCount === 0 && ordersCount > 0) return 'orders';
      if (current === 'orders' && ordersCount === 0 && bookingsCount > 0) return 'bookings';
      return current;
    });
  }, [bookingsCount, ordersCount]);

  return (
    <View style={styles.wrap}>
      <View style={styles.tabTrack}>
        <TabButton
          label="Bookings"
          icon="calendar"
          count={bookingsCount}
          active={activeTab === 'bookings'}
          onPress={() => setActiveTab('bookings')}
        />
        <TabButton
          label="Online orders"
          icon="shopping-bag"
          count={ordersCount}
          active={activeTab === 'orders'}
          onPress={() => setActiveTab('orders')}
        />
      </View>
      <View style={styles.panel}>{activeTab === 'bookings' ? bookingsPanel : ordersPanel}</View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  count,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const iconColor = active ? colors.primary : colors.mutedForeground;
  return (
    <Pressable
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.tabPressed]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Feather name={icon} size={14} color={iconColor} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {count > 0 ? (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  tabTrack: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.tint,
  },
  tabPressed: {
    opacity: 0.88,
  },
  tabLabel: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
    flexShrink: 1,
  },
  tabLabelActive: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: colors.primary,
  },
  tabBadgeText: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
  },
  tabBadgeTextActive: {
    color: colors.primaryForeground,
  },
  panel: {
    width: '100%',
  },
});
