import { NavLink, Outlet } from 'react-router-dom';

const biNav = [
  { to: '/bi/overview', label: 'Overview' },
  { to: '/bi/revenue', label: 'Revenue' },
  { to: '/bi/forecast', label: 'Forecast' },
  { to: '/bi/reports', label: 'Reports' },
];

export function BILayout() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
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
        <strong style={{ display: 'block', marginBottom: 10 }}>Business Intelligence</strong>
        <nav style={{ display: 'grid', gap: 6 }}>
          {biNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
      <Outlet />
    </div>
  );
}

export default BILayout;
