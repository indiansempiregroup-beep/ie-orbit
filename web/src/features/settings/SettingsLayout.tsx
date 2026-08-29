import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { useAuth } from '../../hooks/useAuth';

const settingsNav = [
  { to: '/settings', labelKey: 'settings.overview', end: true },
  { to: '/settings/business', labelKey: 'settings.businessProfile' },
  { to: '/settings/payments', labelKey: 'settings.payments', label: 'Payments' },
  { to: '/settings/products', labelKey: 'settings.productsBilling' },
  { to: '/settings/team', labelKey: 'settings.team', permission: 'iam:role:assign' },
];

export function SettingsLayout() {
  const { t } = useTranslation();
  const auth = useAuth();
  const permissions = auth.user?.permissions ?? [];
  const visibleNav = settingsNav.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <div className="settings-layout" style={{ display: 'grid', gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <nav aria-label={t('settings.navigation')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '10px 14px',
                borderRadius: 10,
                textDecoration: 'none',
                fontWeight: 600,
                color: isActive ? '#1d4ed8' : '#4b5563',
                background: isActive ? '#eff6ff' : 'transparent',
                border: isActive ? '1px solid #bfdbfe' : '1px solid transparent',
              })}
            >
              {'label' in item ? item.label : t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </Card>
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
