import { Card } from '../../components/Card';
import { formatTimestamp } from '../../lib/datetime';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformAuditFeedQuery } from '../settings/billingHooks';

export function PlatformAuditPage() {
  usePageMeta({ title: 'Audit — Platform Admin' });
  const auditFeedQuery = useBillingPlatformAuditFeedQuery(50, true);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Audit Log</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Platform billing and operations audit feed.</p>
      </Card>
      <Card>
        {auditFeedQuery.isLoading ? (
          <p style={{ color: 'var(--muted-foreground)' }}>Loading audit feed...</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(auditFeedQuery.data?.rows ?? []).map((row) => (
              <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <strong>{row.action}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  {row.resource_type} · Tenant {row.tenant_id} · {formatTimestamp(row.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default PlatformAuditPage;
