import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';

export type ProductImageCropResult = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  imageUrl: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (crop: ProductImageCropResult, options?: { removeBackground: boolean }) => void;
  canRemoveBackground?: boolean;
};

const MIN = 0.05;
const HIT = 28;
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

function clampRect(next: ProductImageCropResult): ProductImageCropResult {
  let { left, top, width, height } = next;
  width = Math.min(Math.max(MIN, width), 1);
  height = Math.min(Math.max(MIN, height), 1);
  left = Math.min(Math.max(0, left), 1 - width);
  top = Math.min(Math.max(0, top), 1 - height);
  return { left, top, width, height };
}

function applyHandle(
  start: ProductImageCropResult,
  handle: Handle,
  dx: number,
  dy: number,
): ProductImageCropResult {
  if (handle === 'move') {
    return clampRect({ ...start, left: start.left + dx, top: start.top + dy });
  }
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  let left = start.left;
  let top = start.top;
  let r = right;
  let b = bottom;
  if (handle === 'nw' || handle === 'w' || handle === 'sw') left = start.left + dx;
  if (handle === 'ne' || handle === 'e' || handle === 'se') r = right + dx;
  if (handle === 'nw' || handle === 'n' || handle === 'ne') top = start.top + dy;
  if (handle === 'sw' || handle === 's' || handle === 'se') b = bottom + dy;
  if (r < left + MIN) {
    if (handle.includes('w')) left = r - MIN;
    else r = left + MIN;
  }
  if (b < top + MIN) {
    if (handle.includes('n')) top = b - MIN;
    else b = top + MIN;
  }
  return clampRect({ left, top, width: r - left, height: b - top });
}

function hitTest(nx: number, ny: number, crop: ProductImageCropResult): Handle | null {
  const left = crop.left;
  const top = crop.top;
  const right = crop.left + crop.width;
  const bottom = crop.top + crop.height;
  // Convert hit radius ~28px assuming ~360px image → ~0.08 norm
  const hit = 0.08;
  const near = (x: number, y: number) => Math.hypot(nx - x, ny - y) <= hit;
  if (near(left, top)) return 'nw';
  if (near(right, top)) return 'ne';
  if (near(left, bottom)) return 'sw';
  if (near(right, bottom)) return 'se';
  if (Math.abs(ny - top) <= hit / 2 && nx >= left && nx <= right) return 'n';
  if (Math.abs(ny - bottom) <= hit / 2 && nx >= left && nx <= right) return 's';
  if (Math.abs(nx - left) <= hit / 2 && ny >= top && ny <= bottom) return 'w';
  if (Math.abs(nx - right) <= hit / 2 && ny >= top && ny <= bottom) return 'e';
  if (nx >= left && nx <= right && ny >= top && ny <= bottom) return 'move';
  return null;
}

/** Single gesture layer — corners resize freely to any shape. */
export function ProductImageCropModal({
  imageUrl,
  open,
  onCancel,
  onConfirm,
  canRemoveBackground = false,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<ProductImageCropResult>({
    left: 0.12,
    top: 0.1,
    width: 0.76,
    height: 0.8,
  });
  const [removeBackground, setRemoveBackground] = useState(false);
  const [active, setActive] = useState<Handle | null>(null);
  const drag = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    start: ProductImageCropResult;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCrop({ left: 0.12, top: 0.1, width: 0.76, height: 0.8 });
    setRemoveBackground(false);
    setActive(null);
  }, [open, imageUrl]);

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      const p = toNorm(event.clientX, event.clientY);
      const handle = hitTest(p.x, p.y, crop);
      if (!handle) return;
      drag.current = { handle, startX: event.clientX, startY: event.clientY, start: crop };
      setActive(handle);
    },
    [crop, toNorm],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!drag.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const dx = (event.clientX - drag.current.startX) / rect.width;
      const dy = (event.clientY - drag.current.startY) / rect.height;
      setCrop(applyHandle(drag.current.start, drag.current.handle, dx, dy));
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
    setActive(null);
  }, []);

  const corner = (key: Handle, style: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    background: '#fff',
    border: `3px solid ${active === key ? '#38bdf8' : '#0f766e'}`,
    pointerEvents: 'none',
    ...style,
  });

  return (
    <Dialog open={open} onClose={onCancel} title="Adjust edges" labelledBy="product-image-crop">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxHeight: 'min(78vh, 720px)',
        }}
      >
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14, flexShrink: 0 }}>
          Pull any white corner to resize freely (any shape). Drag inside to move. Then Use crop.
        </p>
        <div
          style={{
            position: 'relative',
            width: '100%',
            flex: '1 1 auto',
            minHeight: 0,
            background: '#0b0f14',
            borderRadius: 8,
            overflow: 'hidden',
            touchAction: 'none',
            userSelect: 'none',
            cursor: 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Crop preview"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              maxHeight: 'min(42vh, 420px)',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
          <div
            style={{
              position: 'absolute',
              left: `${crop.left * 100}%`,
              top: `${crop.top * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
              border: '2px solid #fff',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div style={corner('nw', { left: -HIT / 2, top: -HIT / 2 })} />
            <div style={corner('ne', { right: -HIT / 2, top: -HIT / 2 })} />
            <div style={corner('sw', { left: -HIT / 2, bottom: -HIT / 2 })} />
            <div style={corner('se', { right: -HIT / 2, bottom: -HIT / 2 })} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          {canRemoveBackground ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(event) => setRemoveBackground(event.target.checked)}
              />
              Remove background
            </label>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="neutral" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                onConfirm(crop, { removeBackground: canRemoveBackground && removeBackground })
              }
            >
              Use crop
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
