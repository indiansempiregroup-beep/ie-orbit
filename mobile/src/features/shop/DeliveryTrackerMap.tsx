import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { ShopDeliveryLive } from '@ie-platform/sdk';
import { colors } from '../../theme/tokens';
import { deliveryMapPoints } from './deliveryMapPoints';

type Props = { live: ShopDeliveryLive; primary: string };

export function DeliveryTrackerMap({ live, primary }: Props) {
  const { pickup, rider, drop, points, center } = deliveryMapPoints(live);
  if (!center) return null;

  return (
    <MapView
      style={styles.deliveryMap}
      scrollEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      initialRegion={{ ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
    >
      {pickup ? <Marker coordinate={pickup} title="Shop" pinColor={colors.warning} /> : null}
      {rider ? <Marker coordinate={rider} title={live.rider?.name || 'Rider'} pinColor={primary} /> : null}
      {drop ? <Marker coordinate={drop} title="Your address" pinColor={colors.success} /> : null}
      {points.length > 1 ? <Polyline coordinates={points} strokeColor={primary} strokeWidth={4} /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  deliveryMap: { width: '100%', height: 220 },
});
