import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';

type Props = {
  onCode: (code: string) => void;
  active: boolean;
  onClose: () => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function BarcodeCameraPanel({ onCode, active, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef('');
  const lastAtRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not available in this browser.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (!window.BarcodeDetector) {
          setError('Live decode needs BarcodeDetector (Chrome/Edge). Use the scan field or HID wedge.');
          return;
        }
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            const now = Date.now();
            if (value && (value !== lastCodeRef.current || now - lastAtRef.current > 1500)) {
              lastCodeRef.current = value;
              lastAtRef.current = now;
              onCode(value);
            }
          } catch {
            /* ignore frame errors */
          }
          raf = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        raf = window.requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setError('Unable to access camera. Check browser permissions.');
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, onCode]);

  if (!active) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', maxHeight: 280, background: '#111', borderRadius: 8 }}
      />
      {error ? <p role="status">{error}</p> : <p>Point the camera at a barcode.</p>}
      <Button type="button" onClick={onClose}>
        Close camera
      </Button>
    </div>
  );
}
