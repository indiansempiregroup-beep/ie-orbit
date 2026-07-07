import { NavLink, Outlet } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';

const adminNav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/tenants', label: 'Tenants' },
  { to: '/admin/subscriptions', label: 'Subscriptions' },
  { to: '/admin/branding', label: 'Branding' },
  { to: '/admin/monitoring', label: 'Monitoring' },
  { to: '/admin/audit', label: 'Audit' },
];

export function AdminLayout() {
  usePageMeta({ title: 'Platform Admin — AppointIE' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
      <aside
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          position: 'sticky',
          top: 16,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 10 }}>Platform Admin</strong>
        <nav style={{ display: 'grid', gap: 6 }}>
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '8px 10px',
                borderRadius: 8,
                textDecoration: 'none',
                color: isActive ? 'var(--primary)' : 'var(--foreground)',
                background: isActive ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                fontWeight: isActive ? 600 : 500,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
