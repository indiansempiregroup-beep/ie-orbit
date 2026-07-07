import { Link, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { usePlatformTenantDetailQuery } from './adminHooks';

export function PlatformTenantDetailPage() {
  const { tenantId } = useParams();
  const detailQuery = usePlatformTenantDetailQuery(tenantId);
  usePageMeta({ title: 'Tenant Detail — Platform Admin' });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <Link to="/admin/tenants" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
          ← Back to tenants
        </Link>
        <h1 style={{ marginTop: 12 }}>{detailQuery.data?.display_name ?? 'Tenant detail'}</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Status: {detailQuery.data?.status ?? '...'} · Slug: {detailQuery.data?.slug ?? '...'}
        </p>
      </Card>
      <Card>
        <h2 style={{ marginTop: 0 }}>Businesses</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(detailQuery.data?.businesses ?? []).map((business) => (
            <div
              key={business.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
            >
              <div>
                <strong>{business.display_name}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  {business.business_code} · {business.selected_product || 'no product'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ textTransform: 'capitalize' }}>{business.status}</div>
                {business.has_white_label_profile ? (
                  <Link to="/admin/branding" style={{ fontSize: 13, color: 'var(--primary)' }}>
                    {business.flavor_key}
                  </Link>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>No white-label profile</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default PlatformTenantDetailPage;
