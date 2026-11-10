import React from 'react';
import { useTranslation } from 'react-i18next';

export function ErrorState({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 24 }} role="alert">
      <h3>{title ?? t('common.errorTitle')}</h3>
      {message && <p style={{ color: '#6b7280' }}>{message}</p>}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onRetry} style={{ padding: '8px 12px', borderRadius: 8 }}>{t('common.retry')}</button>
        </div>
      )}
    </div>
  );
}
