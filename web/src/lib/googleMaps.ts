export type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Map: new (
        el: HTMLElement,
        opts: {
          center: { lat: number; lng: number };
          zoom: number;
          mapTypeControl?: boolean;
          streetViewControl?: boolean;
          fullscreenControl?: boolean;
        },
      ) => {
        addListener: (eventName: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
        panTo: (latLng: { lat: number; lng: number }) => void;
        setCenter: (latLng: { lat: number; lng: number }) => void;
      };
      Marker: new (opts: {
        map: unknown;
        position: { lat: number; lng: number };
        draggable?: boolean;
      }) => {
        addListener: (eventName: string, handler: () => void) => void;
        getPosition: () => { lat: () => number; lng: () => number } | undefined;
        setPosition: (latLng: { lat: number; lng: number }) => void;
      };
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

export function loadGoogleMaps(apiKey: string): Promise<void> {
  const win = window as GoogleMapsWindow;
  if (win.google?.maps) {
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps.'));
    document.head.appendChild(script);
  });
  return win.__ieGoogleMapsPromise;
}
