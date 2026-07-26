import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Snackbar = { id: string; message: string; severity: 'info' | 'success' | 'warning' | 'error' };

type SnackbarContextState = {
  push: (message: string, severity?: Snackbar['severity']) => void;
  dismiss: (id: string) => void;
  items: Snackbar[];
};

const SnackbarContext = createContext<SnackbarContextState | undefined>(undefined);

function SnackbarHost({ items, dismiss }: { items: Snackbar[]; dismiss: (id: string) => void }) {
  return createPortal(
    <div className="snackbar-host" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`snackbar snackbar-${item.severity}`} role="status">
          <div>{item.message}</div>
          <button
            type="button"
            className="snackbar-close"
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Snackbar[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((s) => s.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, severity: Snackbar['severity'] = 'info') => {
      const id = String(Date.now()) + Math.random().toString(16).slice(2);
      setItems((s) => [...s, { id, message, severity }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss, items }), [dismiss, items, push]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarHost items={items} dismiss={dismiss} />
    </SnackbarContext.Provider>
  );
}

export function useSnackbarContext() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbarContext must be used within SnackbarProvider');
  return ctx;
}
