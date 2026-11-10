import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { PRODUCT_CATALOG, getProductName } from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { slugifyBusinessCode } from '../../lib/workspace';
import { useBusinessListQuery, useCreateBusiness } from './businessSettingsHooks';
import { BranchesPanel } from './BranchesPanel';
import { BusinessProfileView } from './BusinessProfileView';

export function BusinessManagementPage() {
  const { t } = useTranslation();
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
      snackbar.push(t('settings.businessMgmt.namesRequired'), 'warning');
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
      snackbar.push(t('settings.businessMgmt.created'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('settings.businessEdit.saveFailed'), 'error');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>{t('settings.businessMgmt.kicker')}</p>
            <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>{t('settings.businessMgmt.title')}</h2>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              {t('settings.businessMgmt.lead')}
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowAddForm((current) => !current)}>
            {showAddForm ? t('common.cancel') : t('settings.businessMgmt.addBusiness')}
          </Button>
        </div>

        {showAddForm ? (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid #dbeafe', background: '#f8fbff', display: 'grid', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{t('settings.businessMgmt.createTitle')}</h3>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessMgmt.businessName')}</span>
                <input
                  value={newBusinessName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewBusinessName(value);
                    if (!newDisplayName) setNewDisplayName(value);
                  }}
                  placeholder={t('settings.businessMgmt.namePlaceholder')}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessEdit.displayName')}</span>
                <input
                  value={newDisplayName}
                  onChange={(event) => setNewDisplayName(event.target.value)}
                  placeholder={t('settings.businessMgmt.namePlaceholder')}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessMgmt.productFor')}</span>
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
                {createBusiness.isPending ? t('settings.businessMgmt.creating') : t('settings.businessMgmt.create')}
              </Button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {businessListQuery.isLoading ? <p>{t('settings.businessMgmt.loading')}</p> : null}
          {!businessListQuery.isLoading && businesses.length === 0 ? (
            <p style={{ color: '#6b7280' }}>{t('settings.businessMgmt.empty')}</p>
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
                    {t('settings.businessMgmt.productLine', {
                      code: item.business_code,
                      product: item.selected_product ? getProductName(item.selected_product) : t('settings.businessMgmt.productNotSet'),
                    })}
                  </p>
                </div>
                {!isActive ? (
                  <Button variant="ghost" onClick={() => workspace.switchBusiness(item.id!)}>
                    {t('settings.businessMgmt.switchTo')}
                  </Button>
                ) : (
                  <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>{t('settings.businessMgmt.active')}</span>
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
