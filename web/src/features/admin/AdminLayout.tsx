import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Building2,
  CreditCard,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Package,
  Palette,
  ScrollText,
  TicketPercent,
  Users,
  Handshake,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePageMeta } from '../../hooks/usePageMeta';
import { hasTenantOpsRole } from '../../utils/roles';
import { redirectToOpsMobileWeb } from '../../lib/impersonation';

const navGroups: Array<{
  label: string;
  items: Array<{ to: string; label: string; icon: ReactNode; end?: boolean }>;
}> = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={16} />, end: true },
      { to: '/admin/revenue', label: 'Revenue', icon: <Banknote size={16} /> },
      { to: '/admin/claims', label: 'Claims', icon: <Inbox size={16} /> },
      { to: '/admin/tenants', label: 'Tenants', icon: <Building2 size={16} /> },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: <CreditCard size={16} /> },
      { to: '/admin/packages', label: 'Packages', icon: <Package size={16} /> },
      { to: '/admin/affiliates', label: 'Affiliates', icon: <Handshake size={16} /> },
      { to: '/admin/coupons', label: 'Coupons', icon: <TicketPercent size={16} /> },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/admin/tickets', label: 'Tickets', icon: <LifeBuoy size={16} /> },
      { to: '/admin/users', label: 'Users', icon: <Users size={16} /> },
      { to: '/admin/announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
      { to: '/admin/help', label: 'Help CMS', icon: <HelpCircle size={16} /> },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/admin/branding', label: 'Branding', icon: <Palette size={16} /> },
      { to: '/admin/monitoring', label: 'Monitoring', icon: <Activity size={16} /> },
      { to: '/admin/audit', label: 'Audit', icon: <ScrollText size={16} /> },
    ],
  },
];

export function AdminLayout() {
  usePageMeta({ title: 'Platform Admin — IE Orbit' });
  const auth = useAuth();
  const navigate = useNavigate();
  const { exitWorkspaceMode, loading } = useWorkspace();
  const canOpenWorkspace = hasTenantOpsRole(auth.user);

  useEffect(() => {
    exitWorkspaceMode();
  }, [exitWorkspaceMode]);

  async function handleOpenWorkspace() {
    redirectToOpsMobileWeb();
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
            <p className="admin-brand__subtitle">IE Orbit control plane</p>
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
