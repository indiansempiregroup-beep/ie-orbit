import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Dialog from '../components/Dialog';

type ConfirmRequest = {
  id: string;
  title?: React.ReactNode;
  message?: React.ReactNode;
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<{
  confirm: (opts: { title?: React.ReactNode; message?: React.ReactNode }) => Promise<boolean>;
} | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);

  const confirm = useCallback((opts: { title?: React.ReactNode; message?: React.ReactNode }) => {
    return new Promise<boolean>((resolve) => {
      const id = Math.random().toString(36).slice(2, 9);
      const req: ConfirmRequest = { id, title: opts.title, message: opts.message, resolve };
      setQueue((q) => [...q, req]);
    });
  }, []);

  const current = queue[0] ?? null;

  const handleClose = useCallback(() => {
    if (!current) return;
    current.resolve(false);
    setQueue((q) => q.slice(1));
  }, [current]);

  const handleConfirm = useCallback(() => {
    if (!current) return;
    current.resolve(true);
    setQueue((q) => q.slice(1));
  }, [current]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {current ? (
        <Dialog open={true} onClose={handleClose} title={current.title} labelledBy={`confirm-${current.id}`}>
          <div style={{ marginBottom: 12 }}>{current.message}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleClose}>Cancel</button>
            <button onClick={handleConfirm}>Confirm</button>
          </div>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirmContext() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmContext must be used within ConfirmProvider');
  return ctx;
}
