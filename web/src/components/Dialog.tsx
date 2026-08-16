import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SubmitOverlay } from './SubmitOverlay';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  labelledBy?: string;
  busy?: boolean;
  busyMessage?: string;
};

function getFocusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'));
}

export function Dialog({ open, onClose, title, children, labelledBy, busy = false, busyMessage }: DialogProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastActive = useRef<HTMLElement | null>(null);

  if (open && !rootRef.current) {
    let el = document.getElementById('ie-dialog-root') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'ie-dialog-root';
      document.body.appendChild(el);
    }
    rootRef.current = el;
  }

  useEffect(() => {
    if (open) {
      lastActive.current = document.activeElement as HTMLElement | null;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const t = window.setTimeout(() => {
        const dlg = dialogRef.current!;
        const candidates = getFocusable(dlg);
        if (candidates.length) candidates[0].focus();
        else dlg.focus();
      }, 0);

      return () => {
        window.clearTimeout(t);
        document.body.style.overflow = prev;
        if (lastActive.current) lastActive.current.focus();
      };
    }
    return undefined;
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busy) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const dlg = dialogRef.current;
        if (!dlg) return;
        const focusable = getFocusable(dlg);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [busy, onClose],
  );

  if (!open || !rootRef.current) return null;

  const content = (
    <div
      role="presentation"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{
          background: 'white',
          borderRadius: 8,
          minWidth: 320,
          maxWidth: '90%',
          padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          position: 'relative',
        }}
        onKeyDown={onKeyDown}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 id={labelledBy}>{title}</h3>
          <button data-dialog-close onClick={busy ? undefined : onClose} disabled={busy} aria-label="Close" style={{ marginLeft: 8 }}>
            ×
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          {children}
          <SubmitOverlay show={busy} message={busyMessage} scope="local" />
        </div>
      </div>
    </div>
  );

  return createPortal(content, rootRef.current);
}

export default Dialog;
