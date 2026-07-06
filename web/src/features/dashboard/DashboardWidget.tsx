import React from 'react';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';

export type WidgetStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  role?: string;
  'aria-label'?: string;
};

export function DashboardWidget({
  title,
  subtitle,
  children,
  loading = false,
  error = null,
  empty = false,
  actions,
  onRefresh,
  footer,
  role,
  'aria-label': ariaLabel,
}: Props) {
  let content: React.ReactNode;

  if (loading) {
    content = (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120, gap: 12 }}>
        <Spinner size={32} />
        <span>Loading…</span>
      </div>
    );
  } else if (error) {
    content = <ErrorState title="Unable to load" message={error.message} onRetry={onRefresh} />;
  } else if (empty) {
    content = <div style={{ color: '#6b7280', minHeight: 120 }}>No data available yet.</div>;
  } else {
    content = children;
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          {subtitle ? <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>{subtitle}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}
              aria-label={`Refresh ${title}`}
            >
              Refresh
            </button>
          ) : null}
        </div>
      </div>
      <div style={{ flex: 1 }}>{content}</div>
      {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
    </Card>
  );
}
