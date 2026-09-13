import { Link } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from '../features/settings/billingHooks';
import { getProductName } from '../config/products';

export function SoftLockBanner() {
  const workspace = useWorkspace();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const billing = billingQuery.data;
  const locked = (workspace.activeBusiness?.product_subscriptions ?? []).filter(
    (subscription) => subscription.status === 'soft_locked',
  );
  const pending = billing?.pending_upi_claims ?? [];

  if (pending.length > 0) {
    const names = [...new Set(pending.flatMap((row) => row.product_codes ?? [row.product_code]).filter(Boolean))].map(
      (code) => getProductName(String(code)),
    );
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
          border: '1px solid var(--primary)',
          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
          color: 'var(--foreground)',
        }}
      >
        <div>
          <strong style={{ display: 'block' }}>Payment under review</strong>
          <span style={{ fontSize: 14, opacity: 0.85 }}>
            {names.join(' and ') || 'Your payment'} was submitted. Access restores after IE confirms (usually same day).
          </span>
        </div>
        <Link
          to="/settings/products"
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            background: 'var(--primary)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Status
        </Link>
      </div>
    );
  }

  if (locked.length === 0 && !billing?.soft_locked) return null;
  const names = (locked.length ? locked.map((row) => getProductName(row.product_code)) : ['this product']).join(' and ');

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
        border: '1px solid #f59e0b',
        background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
        color: 'var(--foreground)',
      }}
    >
      <div>
        <strong style={{ display: 'block' }}>Renew {names}</strong>
        <span style={{ fontSize: 14, opacity: 0.85 }}>
          You can still view data. New bookings, staff, and offices stay locked until you pay this period.
        </span>
      </div>
      <Link
        to="/settings/products"
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          background: 'var(--primary)',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        Renew now
      </Link>
    </div>
  );
}
