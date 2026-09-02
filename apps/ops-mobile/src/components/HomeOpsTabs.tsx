import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <View style={styles.tabRow}>
        <TabButton
          label="Bookings"
          count={bookingsCount}
          active={activeTab === 'bookings'}
          onPress={() => setActiveTab('bookings')}
        />
        <TabButton
          label="Online orders"
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
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
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
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  tabActive: {
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tabLabel: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: colors.mutedForeground,
  },
  tabLabelActive: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.card,
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
