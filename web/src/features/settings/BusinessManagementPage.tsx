import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { PRODUCT_CATALOG } from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { slugifyBusinessCode } from '../../lib/workspace';
import { useBusinessListQuery, useCreateBusiness } from './businessSettingsHooks';
import { BranchesPanel } from './BranchesPanel';
import { BusinessProfileView } from './BusinessProfileView';

export function BusinessManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useWorkspace();
  const businessListQuery = useBusinessListQuery();
  const createBusiness = useCreateBusiness();
  const snackbar = useSnackbar();

  const [showAddForm, setShowAddForm] = useState(searchParams.get('action') === 'add');
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newProduct, setNewProduct] = useState('appointie');

  useEffect(() => {
    setShowAddForm(searchParams.get('action') === 'add');
  }, [searchParams]);

  const businesses = useMemo(() => businessListQuery.data ?? [], [businessListQuery.data]);

  async function handleCreateBusiness() {
    if (!newBusinessName.trim() || !newDisplayName.trim()) {
      snackbar.push('Business name and display name are required.', 'warning');
      return;
    }

    try {
      await createBusiness.mutateAsync({
        business_code: slugifyBusinessCode(newDisplayName),
        business_name: newBusinessName.trim(),
        display_name: newDisplayName.trim(),
        business_type: 'service-business',
        selected_product: newProduct,
      });
      setShowAddForm(false);
      setSearchParams({});
      setNewBusinessName('');
      setNewDisplayName('');
      snackbar.push('Business created successfully.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to create business.', 'error');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>Your businesses</p>
            <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>Manage businesses</h2>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              Each business can run its own product. Switch businesses from the header or below.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowAddForm((current) => !current)}>
            {showAddForm ? 'Cancel' : 'Add business'}
          </Button>
        </div>

        {showAddForm ? (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid #dbeafe', background: '#f8fbff', display: 'grid', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Create a new business</h3>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Business name</span>
                <input
                  value={newBusinessName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewBusinessName(value);
                    if (!newDisplayName) setNewDisplayName(value);
                  }}
                  placeholder="Empire Clinic"
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Display name</span>
                <input
                  value={newDisplayName}
                  onChange={(event) => setNewDisplayName(event.target.value)}
                  placeholder="Empire Clinic"
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Product for this business</span>
              <select
                value={newProduct}
                onChange={(event) => setNewProduct(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              >
                {PRODUCT_CATALOG.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={handleCreateBusiness} disabled={createBusiness.isPending}>
                {createBusiness.isPending ? 'Creating…' : 'Create business'}
              </Button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {businessListQuery.isLoading ? <p>Loading businesses…</p> : null}
          {!businessListQuery.isLoading && businesses.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No businesses yet. Click "Add business" to create one.</p>
          ) : null}
          {businesses.map((item) => {
            const isActive = workspace.businessId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 12,
                  border: isActive ? '1px solid #1a56db' : '1px solid #e5e7eb',
                  background: isActive ? '#eef2ff' : '#fff',
                }}
              >
                <div>
                  <strong>{item.display_name ?? item.business_name}</strong>
                  <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                    {item.business_code} · Product: {item.selected_product || 'not set'}
                  </p>
                </div>
                {!isActive ? (
                  <Button variant="ghost" onClick={() => workspace.switchBusiness(item.id!)}>
                    Switch to this business
                  </Button>
                ) : (
                  <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>Active</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <BusinessProfileView />
      </Card>

      <BranchesPanel />
    </div>
  );
}
