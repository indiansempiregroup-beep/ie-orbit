import { useEffect, useMemo, useRef, useState } from 'react';
import { createAuthenticatedClient } from '../lib/apiClient';
import { useAuth } from '../hooks/useAuth';
import { AddressMapPin } from './AddressMapPin';
import type { PlaceSelection } from './AddressPlacesField';

type Prediction = {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text?: string;
};

type Props = {
  label?: string;
  value: string;
  latitude: number | null;
  longitude: number | null;
  onChangeText: (value: string) => void;
  onPlaceSelected: (place: PlaceSelection) => void;
  height?: number;
};

function newSessionToken() {
  return globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asPlace(data: {
  formatted_address: string;
  line1: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): PlaceSelection {
  return {
    formattedAddress: data.formatted_address,
    line1: data.line1 || data.formatted_address,
    city: data.city || undefined,
    state: data.state || undefined,
    country: data.country || undefined,
    postalCode: data.postal_code || undefined,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
  };
}

export function AddressLocationPicker({
  label = 'Search address or place',
  value,
  latitude,
  longitude,
  onChangeText,
  onPlaceSelected,
  height = 220,
}: Props) {
  const auth = useAuth();
  const client = useMemo(() => createAuthenticatedClient(auth.token), [auth.token]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedTerm, setTypedTerm] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef(newSessionToken());
  const typedValueRef = useRef<string | null>(null);
  // Read inside the debounce so moving the pin biases the next search without
  // restarting the current one.
  const biasRef = useRef({ latitude, longitude });
  biasRef.current = { latitude, longitude };

  useEffect(() => {
    if (value === typedValueRef.current) return;
    // The parent set this text (opening an edit form, resetting after save), so
    // it is not something the merchant is searching for.
    typedValueRef.current = null;
    setTypedTerm('');
    setPredictions([]);
  }, [value]);

  useEffect(() => {
    const term = typedTerm.trim();
    if (term.length < 3) {
      setPredictions([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const response = await client.places.autocomplete({
            input: term,
            session_token: sessionTokenRef.current,
            latitude: biasRef.current.latitude ?? undefined,
            longitude: biasRef.current.longitude ?? undefined,
            country_code: 'IN',
          });
          setPredictions(response.data.predictions);
        } catch (err) {
          setPredictions([]);
          setError(err instanceof Error ? err.message : 'Unable to search addresses.');
        } finally {
          setLoading(false);
        }
      })();
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [client, typedTerm]);

  function handleTyping(next: string) {
    typedValueRef.current = next;
    setTypedTerm(next);
    onChangeText(next);
  }

  async function selectPrediction(prediction: Prediction) {
    if (timerRef.current) clearTimeout(timerRef.current);
    typedValueRef.current = prediction.description;
    setTypedTerm('');
    setPredictions([]);
    onChangeText(prediction.description);
    setLoading(true);
    setError(null);
    try {
      const response = await client.places.details({
        place_id: prediction.place_id,
        session_token: sessionTokenRef.current,
      });
      sessionTokenRef.current = newSessionToken();
      onPlaceSelected(asPlace(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this place.');
    } finally {
      setLoading(false);
    }
  }

  async function reverse(latitudeValue: number, longitudeValue: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    setError(null);
    try {
      const response = await client.places.reverse({
        latitude: latitudeValue,
        longitude: longitudeValue,
      });
      const place = asPlace(response.data);
      typedValueRef.current = place.formattedAddress;
      setTypedTerm('');
      setPredictions([]);
      onPlaceSelected(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to identify this map location.');
    } finally {
      setLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Current location is not supported by this browser.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void reverse(position.coords.latitude, position.coords.longitude);
      },
      (locationError) => {
        setLoading(false);
        setError(locationError.message || 'Allow location access and try again.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <label style={{ color: '#6b7280', fontSize: 13 }}>{label}</label>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={loading}
          style={{ border: 0, background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
        >
          Use current location
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={(event) => handleTyping(event.target.value)}
          placeholder="Search address, shop, building or landmark"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
        />
        {loading ? <span style={{ position: 'absolute', right: 12, top: 12, color: '#6b7280', fontSize: 12 }}>Searching…</span> : null}
        {predictions.length ? (
          <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,.16)' }}>
            {predictions.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onClick={() => void selectPrediction(item)}
                style={{ width: '100%', display: 'grid', gap: 2, padding: '11px 12px', border: 0, borderBottom: '1px solid #f1f5f9', background: '#fff', textAlign: 'left', cursor: 'pointer' }}
              >
                <span style={{ fontWeight: 600, color: '#111827' }}>{item.main_text || item.description}</span>
                {item.secondary_text ? <span style={{ color: '#6b7280', fontSize: 12 }}>{item.secondary_text}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <AddressMapPin
        latitude={latitude}
        longitude={longitude}
        onLocationChange={(lat, lng) => void reverse(lat, lng)}
        height={height}
      />
      {error ? <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
