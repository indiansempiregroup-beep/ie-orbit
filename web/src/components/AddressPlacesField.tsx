import { useEffect, useRef, useState } from 'react';

export type PlaceSelection = {
  formattedAddress: string;
  line1: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  onPlaceSelected?: (place: PlaceSelection) => void;
};

const PLACES_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? '';

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          opts?: { fields?: string[]; types?: string[] },
        ) => {
          addListener: (eventName: string, handler: () => void) => void;
          getPlace: () => {
            formatted_address?: string;
            address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
            geometry?: { location?: { lat: () => number; lng: () => number } };
          };
        };
      };
    };
  };
  __ieGoogleMapsPromise?: Promise<void>;
};

function componentByType(
  components: Array<{ long_name: string; short_name: string; types: string[] }> | undefined,
  type: string,
) {
  return components?.find((item) => item.types.includes(type))?.long_name ?? '';
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  const win = window as GoogleMapsWindow;
  if (win.google?.maps?.places) {
    return Promise.resolve();
  }
  if (win.__ieGoogleMapsPromise) {
    return win.__ieGoogleMapsPromise;
  }
  win.__ieGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ie-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps.')));
      return;
    }
    const script = document.createElement('script');
    script.dataset.ieGoogleMaps = '1';
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps.'));
    document.head.appendChild(script);
  });
  return win.__ieGoogleMapsPromise;
}

export function AddressPlacesField({
  label = 'Office address',
  value,
  onChangeText,
  onPlaceSelected,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PLACES_KEY || !inputRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadGoogleMaps(PLACES_KEY);
        if (cancelled || !inputRef.current) return;
        const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
        if (!Autocomplete) {
          setError('Google Places is unavailable.');
          return;
        }
        const autocomplete = new Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'address_component', 'geometry'],
          types: ['geocode'],
        });
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const formatted = place.formatted_address || inputRef.current?.value || '';
          const components = place.address_components;
          const selection: PlaceSelection = {
            formattedAddress: formatted,
            line1:
              [componentByType(components, 'street_number'), componentByType(components, 'route')]
                .filter(Boolean)
                .join(' ') || formatted,
            city:
              componentByType(components, 'locality') ||
              componentByType(components, 'administrative_area_level_2'),
            state: componentByType(components, 'administrative_area_level_1'),
            country: componentByType(components, 'country'),
            postalCode: componentByType(components, 'postal_code'),
            latitude: place.geometry?.location ? place.geometry.location.lat() : null,
            longitude: place.geometry?.location ? place.geometry.location.lng() : null,
          };
          onChangeText(formatted);
          onPlaceSelected?.(selection);
        });
      } catch {
        if (!cancelled) setError('Unable to load Google Places.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onChangeText, onPlaceSelected]);

  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: '#6b7280', fontSize: 13 }}>{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
        placeholder={PLACES_KEY ? 'Search address on Google Maps' : 'Enter full address'}
        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
      />
      {!PLACES_KEY ? (
        <span style={{ color: '#b45309', fontSize: 12 }}>
          Set <code>VITE_GOOGLE_PLACES_API_KEY</code> in the repo-root <code>.env</code>, then restart Vite, to enable Google Places.
        </span>
      ) : null}
      {error ? <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span> : null}
    </label>
  );
}
