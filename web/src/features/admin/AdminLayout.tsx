import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePageMeta } from '../../hooks/usePageMeta';
import { hasTenantOpsRole } from '../../utils/roles';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: '◆', end: true },
      { to: '/admin/tenants', label: 'Tenants', icon: '▦' },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: '◉' },
      { to: '/admin/packages', label: 'Packages', icon: '◫' },
      { to: '/admin/coupons', label: 'Coupons', icon: '%' },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/admin/tickets', label: 'Tickets', icon: '☎' },
      { to: '/admin/announcements', label: 'Announcements', icon: '✦' },
      { to: '/admin/help', label: 'Help CMS', icon: '?' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/admin/branding', label: 'Branding', icon: '◈' },
      { to: '/admin/monitoring', label: 'Monitoring', icon: '◎' },
      { to: '/admin/audit', label: 'Audit', icon: '☰' },
    ],
  },
];

export function AdminLayout() {
  usePageMeta({ title: 'Platform Admin — AppointIE' });
  const auth = useAuth();
  const navigate = useNavigate();
  const { enterWorkspaceMode, exitWorkspaceMode, loading } = useWorkspace();
  const canOpenWorkspace = hasTenantOpsRole(auth.user);

  useEffect(() => {
    exitWorkspaceMode();
  }, [exitWorkspaceMode]);

  async function handleOpenWorkspace() {
    await enterWorkspaceMode();
    navigate('/dashboard');
  }

  async function handleSignOut() {
    await auth.logout();
    navigate('/auth');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand__mark" aria-hidden>
            IE
          </div>
          <div>
            <p className="admin-brand__title">Platform Admin</p>
            <p className="admin-brand__subtitle">AppointIE control plane</p>
          </div>
        </div>

        {navGroups.map((group) => (
          <div key={group.label} className="admin-nav-group">
            <p className="admin-nav-group__label">{group.label}</p>
            <nav className="admin-nav">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `admin-nav__link${isActive ? ' is-active' : ''}`}
                >
                  <span className="admin-nav__icon" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}

        <div className="admin-sidebar__footer">
          <p className="admin-sidebar__user">{auth.user?.full_name || auth.user?.email || 'Admin'}</p>
          <div className="admin-sidebar__actions">
            {canOpenWorkspace ? (
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={loading}
                onClick={() => void handleOpenWorkspace()}
              >
                {loading ? 'Opening…' : 'Open workspace'}
              </button>
            ) : null}
            <Link className="admin-btn admin-btn--ghost" to="/admin/profile">
              Profile
            </Link>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
