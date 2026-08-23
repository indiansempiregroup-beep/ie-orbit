import { AddressMapPreview } from './AddressMapPreview';
import { loadGoogleMaps, type GoogleMapsWindow } from '../lib/googleMaps';
import { useEffect, useRef } from 'react';

const PLACES_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? '';
const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 };

type AddressMapPinProps = {
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
  height?: number;
};

export function AddressMapPin({
  latitude,
  longitude,
  onLocationChange,
  height = 220,
}: AddressMapPinProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onLocationChange);
  onChangeRef.current = onLocationChange;

  useEffect(() => {
    if (!PLACES_KEY || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadGoogleMaps(PLACES_KEY);
        if (cancelled || !mapRef.current) return;
        const maps = (window as GoogleMapsWindow).google?.maps;
        if (!maps) return;
        const center = {
          lat: latitude ?? DEFAULT_CENTER.lat,
          lng: longitude ?? DEFAULT_CENTER.lng,
        };
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const marker = new maps.Marker({
          map,
          position: center,
          draggable: true,
        });
        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (!position) return;
          onChangeRef.current(position.lat(), position.lng());
        });
        map.addListener('click', (event) => {
          if (!event.latLng) return;
          const next = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          marker.setPosition(next);
          onChangeRef.current(next.lat, next.lng);
        });
        const host = mapRef.current as HTMLDivElement & {
          __ieMap?: typeof map;
          __ieMarker?: typeof marker;
        };
        host.__ieMap = map;
        host.__ieMarker = marker;
      } catch {
        /* AddressMapPreview fallback is used when the key is missing. */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount once; pin position is synced in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (latitude == null || longitude == null || !mapRef.current) return;
    const host = mapRef.current as HTMLDivElement & {
      __ieMap?: { panTo: (latLng: { lat: number; lng: number }) => void };
      __ieMarker?: { setPosition: (latLng: { lat: number; lng: number }) => void };
    };
    const next = { lat: latitude, lng: longitude };
    host.__ieMarker?.setPosition(next);
    host.__ieMap?.panTo(next);
  }, [latitude, longitude]);

  if (!PLACES_KEY) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <AddressMapPreview latitude={latitude} longitude={longitude} height={height} />
        <span style={{ color: '#b45309', fontSize: 12 }}>
          Set <code>VITE_GOOGLE_PLACES_API_KEY</code> to drag the pin on an interactive map.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        ref={mapRef}
        style={{ width: '100%', height, border: 0, borderRadius: 12, overflow: 'hidden' }}
      />
      <span style={{ color: '#6b7280', fontSize: 12 }}>
        Search an address, then tap the map or drag the pin if you need to nudge it.
      </span>
    </div>
  );
}
