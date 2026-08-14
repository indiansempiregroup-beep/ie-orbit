import { useState } from 'react';

import { useAuth } from '../hooks/useAuth';

export function ImpersonationBanner() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.isImpersonating) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: 12,
        border: '1px solid #2563eb',
        background: 'color-mix(in srgb, #2563eb 12%, transparent)',
        color: 'var(--foreground)',
      }}
    >
      <div>
        <strong style={{ display: 'block' }}>
          Acting as {auth.user?.email ?? 'tenant owner'} · Platform support session
        </strong>
        <span style={{ fontSize: 14, opacity: 0.85 }}>
          You have full owner access for this tenant. Exit when finished to return to Platform Admin.
        </span>
        {error ? (
          <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: '#b91c1c' }}>{error}</span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy || auth.loading}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await auth.endImpersonation();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end impersonation');
            setBusy(false);
          }
        }}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Exiting…' : 'Exit to Platform Admin'}
      </button>
    </div>
  );
}
