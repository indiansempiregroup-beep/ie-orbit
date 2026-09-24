import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShellHeader } from './AppShellHeader';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { ImpersonationBanner } from './ImpersonationBanner';
import { SoftLockBanner } from './SoftLockBanner';
import { AssistantPanel } from '../features/assistant/AssistantPanel';
import { useAuth } from '../hooks/useAuth';
import { useProductNavigation } from '../hooks/useProductNavigation';
import { formatUserRole } from '../utils/roles';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useWorkspaceLogo } from '../hooks/useWorkspaceLogo';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { buildWorkspaceSnapshot } from '../lib/workspaceModel';
import { useBusinessBillingSnapshotQuery } from '../features/settings/billingHooks';

const ASSISTANT_FEATURES = ['shopie_ai_assistant', 'appointie_ai_assistant'] as const;

export function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();
  const { primaryNav } = useProductNavigation();
  const workspaceLogo = useWorkspaceLogo();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  useNotificationStream();

  const assistantEnabled = useMemo(() => {
    const features = [
      ...((billingQuery.data?.entitled_features as string[] | undefined) ?? []),
      ...((billingQuery.data?.features as string[] | undefined) ?? []),
    ];
    return ASSISTANT_FEATURES.some((code) => features.includes(code));
  }, [billingQuery.data?.entitled_features, billingQuery.data?.features]);

  const workspaceSnapshot = useMemo(
    () =>
      buildWorkspaceSnapshot({
        tenantId: workspace.tenantId,
        business: workspace.activeBusiness,
        activeProduct: workspace.activeProduct,
      }),
    [workspace.tenantId, workspace.activeBusiness, workspace.activeProduct],
  );

  const roleLabel = formatUserRole(auth.user?.roles);

  return (
    <div className="app-shell">
      <aside className="app-shell-aside">
        <div className="app-shell-brand">
          <div
            className={`app-shell-brand-mark${workspaceLogo ? ' has-logo' : ''}`}
            aria-hidden={Boolean(workspaceLogo)}
          >
            {workspaceLogo ? (
              <img
                src={workspaceLogo}
                alt=""
                className="app-shell-brand-logo"
              />
            ) : (
              (workspaceSnapshot.businessName.charAt(0) || 'A').toUpperCase()
            )}
          </div>
          <div>
            <p className="app-shell-brand-label">
              {t('common.workspace')}{' '}
              <span className="app-shell-brand-product">· {workspaceSnapshot.productName}</span>
            </p>
            <h1 className="app-shell-brand-name">{workspaceSnapshot.businessName}</h1>
          </div>
        </div>

        <nav className="app-shell-nav" aria-label={t('nav.primary')}>
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-shell-link${isActive ? ' active' : ''}`}
            >
              <span className="app-shell-link-icon">
                <item.icon size={18} />
              </span>
              <span>{t(item.labelKey)}</span>
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
            <span>{t('auth.signOut')}</span>
          </button>
        </nav>

        <div className="app-shell-footer">
          <div className="app-shell-user-pill">
            <div className="app-shell-user-avatar">{(auth.user?.full_name ?? 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>{auth.user?.full_name ?? t('common.user')}</strong>
              <p>
                {roleLabel}
                {!auth.user?.email_verified_at ? ` · ${t('auth.emailNotVerified')}` : ''}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-shell-content">
        <AppShellHeader />
        <main className="app-shell-main" role="main">
          <div className="app-shell-banners">
            <ImpersonationBanner />
            <EmailVerificationBanner />
            <SoftLockBanner />
          </div>
          <Outlet />
        </main>
      </div>

      {assistantEnabled && !assistantOpen ? (
        <button
          type="button"
          className="assistant-fab"
          aria-label="Business Assistant"
          title="Assistant"
          onClick={() => setAssistantOpen(true)}
        >
          <span className="assistant-fab-ring" aria-hidden />
          <span className="assistant-fab-core">
            <Zap size={20} strokeWidth={2.4} />
            <span className="assistant-fab-label">AI</span>
          </span>
        </button>
      ) : null}

      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
