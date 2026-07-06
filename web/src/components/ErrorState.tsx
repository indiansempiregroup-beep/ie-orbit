import React from 'react';

export function ErrorState({ title = 'Error', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div style={{ padding: 24 }} role="alert">
      <h3>{title}</h3>
      {message && <p style={{ color: '#6b7280' }}>{message}</p>}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onRetry} style={{ padding: '8px 12px', borderRadius: 8 }}>Retry</button>
        </div>
      )}
    </div>
  );
}
