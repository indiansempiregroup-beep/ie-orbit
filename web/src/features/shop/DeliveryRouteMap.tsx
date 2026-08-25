import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShopDeliveryLive } from '@ie-orbit/sdk';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { loadGoogleMaps, type GoogleMapsWindow } from '../../lib/googleMaps';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? '';

type Point = { lat: number; lng: number };
type DeliveryMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => {
    fitBounds: (bounds: unknown, padding?: number) => void;
  };
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  LatLngBounds: new () => { extend: (point: Point) => void };
};

function point(value?: { latitude?: number | null; longitude?: number | null } | null): Point | null {
  const lat = Number(value?.latitude);
  const lng = Number(value?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function DeliveryRouteMap({ delivery, height = 300 }: { delivery: ShopDeliveryLive; height?: number }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const pickup = point(delivery.pickup);
  const drop = point(delivery.drop);
  const trail = useMemo(
    () => (delivery.location_trail ?? []).map(point).filter((item) => item != null),
    [delivery.location_trail],
  );
  const rider = point(delivery.rider_location) ?? trail[trail.length - 1] ?? null;
  const points = useMemo(
    () => [pickup, ...trail, rider, drop].filter((item) => item != null),
    [drop, pickup, rider, trail],
  );

  useEffect(() => {
    if (!MAPS_KEY || !mapRef.current || !points.length) return;
    let cancelled = false;
    void loadGoogleMaps(MAPS_KEY)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const maps = (window as GoogleMapsWindow).google?.maps as unknown as DeliveryMaps | undefined;
        if (!maps) throw new Error('Google Maps unavailable');
        const map = new maps.Map(mapRef.current, {
          center: rider ?? drop ?? pickup ?? points[0],
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        });
        if (trail.length > 1) {
          new maps.Polyline({
            map,
            path: trail,
            strokeColor: '#2563eb',
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
        }
        if (pickup) new maps.Marker({ map, position: pickup, title: 'Pickup', label: 'P' });
        if (drop) new maps.Marker({ map, position: drop, title: 'Drop-off', label: 'D' });
        if (rider) new maps.Marker({ map, position: rider, title: 'Latest rider location', label: 'R' });
        const bounds = new maps.LatLngBounds();
        points.forEach((item) => bounds.extend(item));
        map.fitBounds(bounds, 48);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [drop, pickup, points, rider, trail]);

  if (!points.length) {
    return (
      <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', border: '1px solid var(--border, #ddd)', borderRadius: 12, color: '#6b7280' }}>
        No GPS locations are available yet. Status updates will continue.
      </div>
    );
  }

  if (!MAPS_KEY || failed) {
    const fallback = rider ?? drop ?? pickup ?? points[0];
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <AddressMapPreview latitude={fallback.lat} longitude={fallback.lng} height={height} />
        <small style={{ color: '#6b7280' }}>
          Interactive route unavailable; showing the latest known location.
        </small>
      </div>
    );
  }

  return <div ref={mapRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} />;
}
