const EMBED_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? '';

type AddressMapPreviewProps = {
  latitude?: number | null;
  longitude?: number | null;
  height?: number;
};

export function AddressMapPreview({ latitude, longitude, height = 220 }: AddressMapPreviewProps) {
  if (latitude == null || longitude == null) {
    return null;
  }

  const src = EMBED_KEY
    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(EMBED_KEY)}&center=${latitude},${longitude}&zoom=15`
    : `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;

  return (
    <iframe
      title="Location map"
      src={src}
      style={{ width: '100%', height, border: 0, borderRadius: 12 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}
