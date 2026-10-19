import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { ShopDeliveryLive, ShopReturnPickupLive } from '@ie-orbit/sdk';
import { colors, typography } from '../../theme/tokens';
import { openInGoogleMaps } from '../../utils/openInGoogleMaps';
import { deliveryMapPoints } from './deliveryMapPoints';

type Props = { live: ShopDeliveryLive | ShopReturnPickupLive; primary: string };

export function DeliveryTrackerMap({ live, primary }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const { pickup, rider, drop, trail, points, center } = deliveryMapPoints(live);
  const signature = points.map((point) => `${point.latitude},${point.longitude}`).join('|');
  const isReturnPickup = String(live.delivery_method || '').toLowerCase() === 'instant_pickup';
  const pickupTitle = isReturnPickup ? 'Your address' : 'Shop';
  const dropTitle = isReturnPickup ? 'Shop' : 'Your address';
  const pickupLabel = live.pickup?.address || pickupTitle;
  const dropLabel = live.drop?.address || (isReturnPickup ? 'Shop' : 'Delivery address');
  const riderName = live.rider?.name || 'Rider';

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
          title={pickupTitle}
          description={pickupLabel}
          pinColor={isReturnPickup ? colors.success : colors.warning}
          onCalloutPress={() => void openInGoogleMaps(pickup.latitude, pickup.longitude, pickupLabel)}
          onPress={() => void openInGoogleMaps(pickup.latitude, pickup.longitude, pickupLabel)}
        />
      ) : null}
      {rider ? (
        <Marker
          coordinate={rider}
          title={riderName}
          pinColor={primary}
          zIndex={10}
          onCalloutPress={() => void openInGoogleMaps(rider.latitude, rider.longitude, riderName)}
          onPress={() => void openInGoogleMaps(rider.latitude, rider.longitude, riderName)}
        />
      ) : null}
      {drop ? (
        <Marker
          coordinate={drop}
          title={dropTitle}
          description={dropLabel}
          pinColor={isReturnPickup ? colors.warning : colors.success}
          onCalloutPress={() => void openInGoogleMaps(drop.latitude, drop.longitude, dropLabel)}
          onPress={() => void openInGoogleMaps(drop.latitude, drop.longitude, dropLabel)}
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
