import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

type TipButtonProps = {
  label: string;
  open: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
};

/** ? button that toggles help. */
export function HelpTip({ label, open, onToggle, size = 'sm' }: TipButtonProps) {
  const dim = size === 'md' ? 22 : 16;

  return (
    <button
      type="button"
      aria-label={`About ${label}`}
      aria-expanded={open}
      title="What does this mean?"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      style={{
        width: dim,
        height: dim,
        borderRadius: 999,
        border: `1px solid ${open ? '#0f766e' : 'var(--border)'}`,
        background: open ? '#0f766e' : '#ffffff',
        color: open ? '#ffffff' : '#64748b',
        fontSize: size === 'md' ? 12 : 10,
        fontWeight: 700,
        lineHeight: 1,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-grid',
        placeItems: 'center',
        padding: 0,
      }}
    >
      ?
    </button>
  );
}

/** Full-screen help dialog — always on top, cannot be clipped. */
export function HelpPanel({
  title,
  help,
  open,
  onClose,
}: {
  title: string;
  help: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          color: '#0f172a',
          borderRadius: 16,
          padding: '20px 22px',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#334155' }}>{help}</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            justifySelf: 'start',
            marginTop: 4,
            border: 'none',
            borderRadius: 10,
            padding: '10px 16px',
            background: '#0f766e',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
