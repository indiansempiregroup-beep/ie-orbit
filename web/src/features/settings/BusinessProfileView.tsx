import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useBusinessLogo } from '../../hooks/useBusinessLogo';
import { buildBusinessProfileSections, businessToFormState } from './businessProfileModel';
import { useBusinessProfileQuery, useTenantBrandingQuery } from './businessSettingsHooks';

const fieldGridStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
} as const;

export function BusinessProfileView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const businessQuery = useBusinessProfileQuery();
  const tenantBrandingQuery = useTenantBrandingQuery();

  const formState = useMemo(() => {
    if (!businessQuery.data) return null;
    return businessToFormState(businessQuery.data, tenantBrandingQuery.data);
  }, [businessQuery.data, tenantBrandingQuery.data]);

  const logoUrl = useBusinessLogo(formState?.logo);

  const sections = useMemo(
    () => (formState ? buildBusinessProfileSections(formState, t) : []),
    [formState, t],
  );

  if (businessQuery.isLoading) {
    return <p>{t('settings.businessView.loading')}</p>;
  }

  if (businessQuery.error && !businessQuery.data) {
    return <p style={{ color: '#dc2626' }}>{businessQuery.error.message}</p>;
  }

  if (!formState) {
    return <p style={{ color: '#6b7280' }}>{t('settings.businessView.empty')}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
            {t('settings.businessProfile')}
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>{formState.display_name || formState.business_name}</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            {t('settings.businessView.lead')}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/settings/business/edit')}>
          {t('settings.overviewPage.editBusinessProfile')}
        </Button>
      </div>

      {logoUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src={logoUrl}
            alt=""
            style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'contain', border: '1px solid #e5e7eb', background: '#fff' }}
          />
          <div>
            <strong>{t('settings.businessView.logo')}</strong>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{t('settings.businessView.logoHint')}</p>
          </div>
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.title} style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{section.title}</h3>
          <div style={fieldGridStyle}>
            {section.items.map((item) => (
              <div key={item.label} style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
