import { useEffect, useState } from 'react';

export function ProofImage({ src, alt = 'Payment screenshot' }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (failed) {
    return <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>Couldn’t load this screenshot. The file may have been removed.</p>;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', borderRadius: 8 }}
    />
  );
}
