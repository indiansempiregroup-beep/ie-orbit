import React, { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ShopDeliveryLive } from '@ie-platform/sdk';
import { colors, typography } from '../../theme/tokens';
import {
  dotIcon,
  loadGoogleMaps,
  MAPS_API_KEY,
  MISSING_KEY_MESSAGE,
  type LatLngLiteral,
} from '../../utils/googleMapsWeb';
import { deliveryMapPoints, type DeliveryPoint } from './deliveryMapPoints';

type Props = { live: ShopDeliveryLive; primary: string };

const asLatLng = (point: DeliveryPoint): LatLngLiteral => ({ lat: point.latitude, lng: point.longitude });

export function DeliveryTrackerMap({ live, primary }: Props) {
  const { pickup, rider, drop, trail, points, center } = deliveryMapPoints(live);
  const [mapError, setMapError] = useState<string | null>(MAPS_API_KEY ? null : MISSING_KEY_MESSAGE);
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Rebuild markers whenever the rider moves; the coordinate list is the signature.
  const signature = points.map((point) => `${point.latitude},${point.longitude}`).join('|');
  const riderName = live.rider?.name || 'Rider';

  useEffect(() => {
    if (!MAPS_API_KEY || !center) return;
    let cancelled = false;
    const overlays: Array<{ setMap: (map: null) => void }> = [];

    loadGoogleMaps()
      .then((maps) => {
        const el = containerRef.current;
        if (cancelled || !el) return;

        const map = new maps.Map(el, {
          center: { lat: center.latitude, lng: center.longitude },
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
            new maps.Marker({ map, position: asLatLng(pickup), title: 'Shop', icon: dotIcon(maps, colors.warning) }),
          );
        }
        if (rider) {
          overlays.push(
            new maps.Marker({ map, position: asLatLng(rider), title: riderName, icon: dotIcon(maps, primary) }),
          );
        }
        if (drop) {
          overlays.push(
            new maps.Marker({
              map,
              position: asLatLng(drop),
              title: 'Your address',
              icon: dotIcon(maps, colors.success),
            }),
          );
        }
        if (trail.length > 1) {
          overlays.push(
            new maps.Polyline({ map, path: trail.map(asLatLng), strokeColor: primary, strokeWeight: 4 }),
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
  }, [signature, primary, riderName]);

  if (!center) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Live GPS will appear here when the rider starts sharing location.</Text>
      </View>
    );
  }

  if (mapError) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{mapError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.deliveryMap}>
      {createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
      {mapReady ? null : (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  deliveryMap: { width: '100%', height: 220 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fallback: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.card,
  },
  fallbackText: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
});
