import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { ShopDeliveryLive } from '@ie-platform/sdk';
import { colors, typography } from '../../theme/tokens';
import { deliveryMapPoints } from './deliveryMapPoints';

type Props = { live: ShopDeliveryLive; primary: string };

export function DeliveryTrackerMap({ live, primary }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const { pickup, rider, drop, trail, points, center } = deliveryMapPoints(live);
  const signature = points.map((point) => `${point.latitude},${point.longitude}`).join('|');

  useEffect(() => {
    if (!mapRef.current || !points.length) return;
    if (points.length === 1) {
      mapRef.current.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 450);
      return;
    }
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 44, right: 44, bottom: 44, left: 44 },
      animated: true,
    });
    // The coordinate signature intentionally retriggers framing when the rider moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!center) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Live GPS will appear here when the rider starts sharing location.</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.deliveryMap}
      rotateEnabled={false}
      pitchEnabled={false}
      initialRegion={{ ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
    >
      {pickup ? (
        <Marker
          coordinate={pickup}
          title="Shop"
          description={live.pickup?.address || ''}
          pinColor={colors.warning}
        />
      ) : null}
      {rider ? <Marker coordinate={rider} title={live.rider?.name || 'Rider'} pinColor={primary} /> : null}
      {drop ? (
        <Marker
          coordinate={drop}
          title="Your address"
          description={live.drop?.address || ''}
          pinColor={colors.success}
        />
      ) : null}
      {trail.length > 1 ? <Polyline coordinates={trail} strokeColor={primary} strokeWidth={4} /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  deliveryMap: { width: '100%', height: 220 },
  fallback: {
    width: '100%',
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.muted,
  },
  fallbackText: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
});
