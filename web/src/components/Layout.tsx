import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/business', label: 'Business' },
  { to: '/customers', label: 'Customers' },
  { to: '/services', label: 'Services' },
  { to: '/staff', label: 'Staff' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
  { to: '/profile', label: 'Profile' },
];

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="app-shell-aside">
        <h1 style={{ marginBottom: 24, fontSize: 24 }}>AppointIE</h1>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                textDecoration: 'none',
                display: 'block',
                padding: '10px 12px',
                borderRadius: 10,
                background: isActive ? '#eef2ff' : 'transparent',
                color: isActive ? '#4338ca' : '#374151',
                fontWeight: 600,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="app-shell-main" role="main">
        <Outlet />
      </main>
    </div>
  );
}
