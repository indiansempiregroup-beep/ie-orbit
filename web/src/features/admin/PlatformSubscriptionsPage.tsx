import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useBillingPlatformSubscriptionsQuery } from '../settings/billingHooks';

export function PlatformSubscriptionsPage() {
  usePageMeta({ title: 'Subscriptions — Platform Admin' });
  const subsQuery = useBillingPlatformSubscriptionsQuery(true);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Subscriptions</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Platform-wide product subscription distribution.
        </p>
      </Card>
      <Card>
        <strong>Total subscriptions</strong>
        <p>{subsQuery.data?.total_subscriptions ?? '...'}</p>
        <h3>By status</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(subsQuery.data?.by_status ?? []).map((row) => (
            <div key={row.status} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ textTransform: 'capitalize' }}>{row.status}</span>
              <span>{row.count}</span>
            </div>
          ))}
        </div>
        <h3>By product</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(subsQuery.data?.by_product ?? []).map((row) => (
            <div key={row.product_code} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{row.product_code}</span>
              <span>{row.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default PlatformSubscriptionsPage;
