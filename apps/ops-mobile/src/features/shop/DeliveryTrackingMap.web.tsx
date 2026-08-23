import React, { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ShopDeliveryLive } from '@ie-platform/sdk';
import { colors } from '../../theme/tokens';
import {
  dotIcon,
  loadGoogleMaps,
  MAPS_API_KEY,
  MISSING_KEY_MESSAGE,
  type LatLngLiteral,
} from '../../utils/googleMapsWeb';
import {
  DELIVERY_MAP_COLORS,
  deliveryMapGeometry,
  deliveryMapPointSignature,
  deliveryPlaceLabel,
  type DeliveryPoint,
} from './deliveryTracking';

type Props = {
  delivery: ShopDeliveryLive;
};

const asLatLng = (point: DeliveryPoint): LatLngLiteral => ({ lat: point.latitude, lng: point.longitude });

export function DeliveryTrackingMap({ delivery }: Props) {
  const { pickup, drop, rider, trail, points } = useMemo(
    () => deliveryMapGeometry(delivery),
    [delivery],
  );
  const center = rider ?? drop ?? pickup;

  const [mapError, setMapError] = useState<string | null>(MAPS_API_KEY ? null : MISSING_KEY_MESSAGE);
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Rebuild markers whenever the rider moves; the coordinate list is the signature.
  const signature = deliveryMapPointSignature(points);
  const pickupLabel = deliveryPlaceLabel(delivery.pickup);
  const dropLabel = deliveryPlaceLabel(delivery.drop);
  const riderName = delivery.rider?.name || 'Rider';

  useEffect(() => {
    if (!MAPS_API_KEY || !center) return;
    let cancelled = false;
    const overlays: Array<{ setMap: (map: null) => void }> = [];

    loadGoogleMaps()
      .then((maps) => {
        const el = containerRef.current;
        if (cancelled || !el) return;

        const map = new maps.Map(el, {
          center: asLatLng(center),
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          zoomControl: true,
          gestureHandling: 'greedy',
        });

        if (pickup) {
          overlays.push(
            new maps.Marker({
              map,
              position: asLatLng(pickup),
              title: `Pickup · ${pickupLabel}`,
              icon: dotIcon(maps, DELIVERY_MAP_COLORS.pickup),
            }),
          );
        }
        if (rider) {
          overlays.push(
            new maps.Marker({
              map,
              position: asLatLng(rider),
              title: riderName,
              icon: dotIcon(maps, DELIVERY_MAP_COLORS.rider),
            }),
          );
        }
        if (drop) {
          overlays.push(
            new maps.Marker({
              map,
              position: asLatLng(drop),
              title: `Drop-off · ${dropLabel}`,
              icon: dotIcon(maps, DELIVERY_MAP_COLORS.drop),
            }),
          );
        }
        if (trail.length > 1) {
          overlays.push(
            new maps.Polyline({ map, path: trail.map(asLatLng), strokeColor: colors.primary, strokeWeight: 4 }),
          );
        }
        if (points.length > 1) {
          const bounds = new maps.LatLngBounds();
          points.forEach((point) => bounds.extend(asLatLng(point)));
          map.fitBounds(bounds, 48);
        }

        setMapReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setMapError(err.message);
      });

    return () => {
      cancelled = true;
      overlays.forEach((overlay) => overlay.setMap(null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, pickupLabel, dropLabel, riderName]);

  if (!center) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Location unavailable</Text>
        <Text style={styles.fallbackText}>Tracking updates will continue even when GPS is unavailable.</Text>
      </View>
    );
  }

  if (mapError) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Map unavailable</Text>
        <Text style={styles.fallbackText}>{mapError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      {createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
      {mapReady ? null : (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 240, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
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
