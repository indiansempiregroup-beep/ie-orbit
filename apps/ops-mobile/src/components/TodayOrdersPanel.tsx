import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ShopOrder } from '@ie-orbit/sdk';
import { HorizontalCarouselPanel } from './HorizontalCarouselPanel';
import { OrderRow } from './OrderRow';
import { Button } from './ui/Button';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

type Props = {
  orders: ShopOrder[];
  loading: boolean;
  customerMap?: Map<string, string>;
  onPressOrder: (orderId: string) => void;
  onSeeAll: () => void;
  onOpenOrders?: () => void;
  hideHeader?: boolean;
  hidePanelMargin?: boolean;
};

export function TodayOrdersPanel({
  orders,
  loading,
  customerMap,
  onPressOrder,
  onSeeAll,
  onOpenOrders,
  hideHeader = false,
  hidePanelMargin = false,
}: Props) {
  return (
    <HorizontalCarouselPanel
      title="Online orders"
      count={orders.length}
      loading={loading}
      onSeeAll={onSeeAll}
      hideHeader={hideHeader}
      hidePanelMargin={hidePanelMargin}
      getItemKey={(index) => orders[index]?.id ?? String(index)}
      emptyState={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyLabel}>Online orders</Text>
          <Text style={styles.emptyTitle}>No open online orders</Text>
          <Text style={styles.emptyHint}>Pickup and delivery orders that need action will show here.</Text>
          {onOpenOrders ? (
            <Button label="Open orders" size="sm" style={styles.emptyBtn} onPress={onOpenOrders} />
          ) : null}
        </View>
      }
      renderItem={(index, activeIndex) => {
        const order = orders[index];
        if (!order) return null;
        return (
          <OrderRow
            compact
            highlight={index === activeIndex}
            order={order}
            customerMap={customerMap}
            onPress={() => onPressOrder(order.id)}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.tint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
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
