type AddressMapPreviewProps = {
  latitude?: number | null;
  longitude?: number | null;
  height?: number;
};

export function AddressMapPreview({ latitude, longitude, height = 220 }: AddressMapPreviewProps) {
  if (latitude == null || longitude == null) {
    return null;
  }

  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;

  return (
    <iframe
      title="Customer location map"
      src={src}
      style={{ width: '100%', height, border: 0, borderRadius: 12 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
