import { useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PRODUCT_CATALOG } from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { slugifyBusinessCode } from '../../lib/workspace';
import { useCreateBusiness } from './businessSettingsHooks';

type BusinessSetupPanelProps = {
  show?: boolean;
};

export function BusinessSetupPanel({ show = true }: BusinessSetupPanelProps) {
  const { t } = useTranslation();
  const createBusiness = useCreateBusiness();
  const snackbar = useSnackbar();
  const [businessName, setBusinessName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('appointie');
  const [isSaving, setIsSaving] = useState(false);

  const isReady = useMemo(() => businessName.trim().length > 0 && displayName.trim().length > 0, [businessName, displayName]);

  if (!show) {
    return null;
  }

  async function handleCreateBusiness() {
    if (!isReady) {
      snackbar.push(t('settings.businessSetup.bothRequired'), 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await createBusiness.mutateAsync({
        business_code: slugifyBusinessCode(displayName),
        business_name: businessName.trim(),
        display_name: displayName.trim(),
        business_type: 'service-business',
        selected_product: selectedProduct,
      });
      setBusinessName('');
      setDisplayName('');
      snackbar.push(t('settings.businessSetup.created'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('settings.businessEdit.saveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #1a56db, #60a5fa)', color: 'white' }}>
            <BriefcaseBusiness size={20} />
          </div>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>{t('settings.businessSetup.kicker')}</p>
            <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>{t('settings.businessSetup.title')}</h2>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessMgmt.businessName')}</span>
            <input value={businessName} onChange={(event) => { const value = event.target.value; setBusinessName(value); if (!displayName) setDisplayName(value); }} placeholder={t('settings.businessSetup.namePlaceholder')} style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessEdit.displayName')}</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t('settings.businessSetup.namePlaceholder')} style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }} />
          </label>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>{t('settings.businessSetup.selectProduct')}</span>
          {PRODUCT_CATALOG.map((product) => {
            const isActive = selectedProduct === product.id;
            return (
              <button key={product.id} type="button" onClick={() => setSelectedProduct(product.id)} style={{ textAlign: 'left', border: isActive ? '1px solid #1a56db' : '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: isActive ? '#eef2ff' : '#fff', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{product.name}</strong>
                  {isActive ? <CheckCircle2 size={18} color="#1a56db" /> : <ChevronRight size={18} color="#94a3b8" />}
                </div>
                <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>{t(`settings.businessSetup.productDesc.${product.id}`, { defaultValue: product.description })}</p>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleCreateBusiness} disabled={!isReady || isSaving}>
            {isSaving ? t('common.saving') : t('settings.businessMgmt.create')}
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
          <Sparkles size={16} color="#10b981" />
          <span>{t('settings.businessSetup.footnote')}</span>
        </div>
      </div>
    </Card>
  );
}
