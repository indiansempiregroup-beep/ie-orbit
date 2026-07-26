import { Link } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from '../features/settings/billingHooks';

export function SoftLockBanner() {
  const workspace = useWorkspace();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const billing = billingQuery.data;

  if (!billing?.soft_locked) return null;

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
        <strong style={{ display: 'block' }}>Trial ended — upgrade required</strong>
        <span style={{ fontSize: 14, opacity: 0.85 }}>
          You can still view data, but new bookings, staff, and offices are locked until you upgrade.
        </span>
      </div>
      <Link
        to="/settings"
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
        Upgrade plan
      </Link>
    </div>
  );
}
