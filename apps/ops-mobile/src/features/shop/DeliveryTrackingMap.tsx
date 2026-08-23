import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { ShopDeliveryLive } from '@ie-platform/sdk';
import { colors } from '../../theme/tokens';
import {
  DELIVERY_MAP_COLORS,
  deliveryMapGeometry,
  deliveryMapPointSignature,
  deliveryPlaceLabel,
} from './deliveryTracking';

type Props = {
  delivery: ShopDeliveryLive;
};

export function DeliveryTrackingMap({ delivery }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const { pickup, drop, rider, trail, points } = useMemo(
    () => deliveryMapGeometry(delivery),
    [delivery],
  );
  const signature = deliveryMapPointSignature(points);

  useEffect(() => {
    if (!mapRef.current || !points.length) return;
    if (points.length === 1) {
      mapRef.current.animateToRegion(
        { ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        450,
      );
      return;
    }
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
    // Reframe only when a coordinate changes, so manual panning is not undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!points.length) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Location unavailable</Text>
        <Text style={styles.fallbackText}>Tracking updates will continue even when GPS is unavailable.</Text>
      </View>
    );
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const region = {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(0.01, (maxLatitude - minLatitude) * 1.5),
    longitudeDelta: Math.max(0.01, (maxLongitude - minLongitude) * 1.5),
  };

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={region}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {pickup ? (
        <Marker
          coordinate={pickup}
          title="Pickup"
          description={deliveryPlaceLabel(delivery.pickup)}
          pinColor={DELIVERY_MAP_COLORS.pickup}
        />
      ) : null}
      {drop ? (
        <Marker
          coordinate={drop}
          title="Drop-off"
          description={deliveryPlaceLabel(delivery.drop)}
          pinColor={DELIVERY_MAP_COLORS.drop}
        />
      ) : null}
      {rider ? (
        <Marker
          coordinate={rider}
          title={delivery.rider?.name || 'Rider'}
          description="Latest reported rider location"
          pinColor={DELIVERY_MAP_COLORS.rider}
        />
      ) : null}
      {trail.length > 1 ? (
        <Polyline coordinates={trail} strokeColor={colors.primary} strokeWidth={4} />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 240, borderRadius: 12, marginTop: 12 },
  fallback: {
    minHeight: 110,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 4,
  },
  fallbackTitle: { color: colors.foreground, fontWeight: '700' },
  fallbackText: { color: colors.mutedForeground, fontSize: 12, textAlign: 'center' },
});
