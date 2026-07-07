import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useMemo } from 'react';
import { AppShellHeader } from './AppShellHeader';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useProductNavigation } from '../hooks/useProductNavigation';
import { buildWorkspaceSnapshot } from '../lib/workspaceModel';

export function Layout() {
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();
  const { primaryNav } = useProductNavigation();

  const workspaceSnapshot = useMemo(
    () =>
      buildWorkspaceSnapshot({
        tenantId: workspace.tenantId,
        business: workspace.activeBusiness,
        activeProduct: workspace.activeProduct,
      }),
    [workspace.tenantId, workspace.activeBusiness, workspace.activeProduct],
  );

  return (
    <div className="app-shell">
      <aside className="app-shell-aside">
        <div className="app-shell-brand">
          <div className="app-shell-brand-mark">A</div>
          <div>
            <p className="app-shell-brand-label">Workspace</p>
            <h1 className="app-shell-brand-name">{workspaceSnapshot.productName}</h1>
            <p className="app-shell-brand-subtitle">{workspaceSnapshot.businessName}</p>
          </div>
        </div>

        <nav className="app-shell-nav" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-shell-link${isActive ? ' active' : ''}`}
            >
              <span className="app-shell-link-icon">
                <item.icon size={18} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            type="button"
            className="app-shell-link logout-link"
            onClick={async () => {
              await auth.logout();
              navigate('/auth');
            }}
          >
            <span className="app-shell-link-icon">
              <LogOut size={18} />
            </span>
            <span>Sign Out</span>
          </button>
        </nav>

        <div className="app-shell-footer">
          <div className="app-shell-user-pill">
            <div className="app-shell-user-avatar">{(auth.user?.full_name ?? 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>{auth.user?.full_name ?? 'User'}</strong>
              <p>{auth.user?.roles?.[0] ?? 'Owner'}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-shell-content">
        <AppShellHeader />
        <main className="app-shell-main" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
