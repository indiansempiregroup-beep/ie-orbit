import { NavLink, Outlet } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useAuth } from '../../hooks/useAuth';

const settingsNav = [
  { to: '/settings', label: 'Overview', end: true },
  { to: '/settings/business', label: 'Business Profile' },
  { to: '/settings/products', label: 'Products' },
  { to: '/settings/team', label: 'Team', permission: 'iam:role:assign' },
];

export function SettingsLayout() {
  const auth = useAuth();
  const permissions = auth.user?.permissions ?? [];
  const visibleNav = settingsNav.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <div className="settings-layout" style={{ display: 'grid', gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <nav aria-label="Settings navigation" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              {item.label}
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
