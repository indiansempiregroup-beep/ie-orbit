import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { usePlatformTenantsQuery } from './adminHooks';

export function PlatformTenantsPage() {
  usePageMeta({ title: 'Tenants — Platform Admin' });
  const tenantsQuery = usePlatformTenantsQuery();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Tenants</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Review tenant status and linked businesses.</p>
      </Card>
      <Card>
        {tenantsQuery.isLoading ? (
          <p style={{ color: 'var(--muted-foreground)' }}>Loading tenants...</p>
        ) : tenantsQuery.error ? (
          <p style={{ color: '#991b1b' }}>{tenantsQuery.error.message}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(tenantsQuery.data ?? []).map((tenant) => (
              <Link
                key={tenant.id}
                to={`/admin/tenants/${tenant.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div>
                  <strong>{tenant.display_name}</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    {tenant.slug} · {tenant.business_count} business(es)
                  </p>
                </div>
                <span style={{ textTransform: 'capitalize' }}>{tenant.status}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default PlatformTenantsPage;
