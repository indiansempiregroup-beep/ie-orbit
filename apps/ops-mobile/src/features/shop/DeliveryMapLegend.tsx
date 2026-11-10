import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme/tokens';
import {
  DELIVERY_MAP_COLORS,
  deliveryMapGeometry,
  deliveryPlaceLabel,
  isReturnPickupLive,
  type OpsDeliveryMapLive,
} from './deliveryTracking';

type Props = {
  delivery: OpsDeliveryMapLive;
};

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

export function DeliveryMapLegend({ delivery }: Props) {
  const { t } = useTranslation();
  const { pickup, drop, rider } = deliveryMapGeometry(delivery);
  if (!pickup && !drop) return null;
  const returnPickup = isReturnPickupLive(delivery);
  return (
    <View style={styles.wrap}>
      {pickup ? (
        <LegendRow
          color={DELIVERY_MAP_COLORS.pickup}
          label={
            returnPickup
              ? t('shop.deliveryMap.collectFromCustomer')
              : t('shop.deliveryMap.pickupFrom')
          }
          value={deliveryPlaceLabel(delivery.pickup)}
        />
      ) : null}
      {rider ? (
        <LegendRow
          color={DELIVERY_MAP_COLORS.rider}
          label={t('shop.orders.detail.rider')}
          value={`${delivery.rider?.name || t('shop.orders.detail.assignedRider')} · ${rider.latitude.toFixed(5)}, ${rider.longitude.toFixed(5)}`}
        />
      ) : null}
      {drop ? (
        <LegendRow
          color={DELIVERY_MAP_COLORS.drop}
          label={
            returnPickup
              ? t('customerApp.returns.detail.returnToShop')
              : t('customerApp.cart.deliverTo')
          }
          value={deliveryPlaceLabel(delivery.drop)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  label: { color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  value: { color: colors.foreground, fontSize: 13 },
});
