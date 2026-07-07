import React from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from './Spinner';

type SubmitOverlayProps = {
  show: boolean;
  message?: string;
  /** fixed = full viewport; local = covers nearest positioned parent */
  scope?: 'fixed' | 'local';
};

export function SubmitOverlay({ show, message = 'Saving…', scope = 'fixed' }: SubmitOverlayProps) {
  if (!show) return null;

  const overlay = (
    <div
      className={`submit-overlay submit-overlay--${scope}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="submit-overlay__panel">
        <Spinner size={36} animated />
        <p className="submit-overlay__message">{message}</p>
      </div>
    </div>
  );

  if (scope === 'fixed') {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
