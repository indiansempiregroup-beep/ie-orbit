import { Link, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { captureAffiliateCodeFromLocation } from '../onboarding/affiliateCode';
import { adminAppIsSeparateHost, getPublicSiteOrigin, isAdminAppHost } from '../../lib/hosts';

export function AuthLayout() {
  useEffect(() => {
    captureAffiliateCodeFromLocation();
  }, []);

  const homeHref =
    adminAppIsSeparateHost() && isAdminAppHost() ? getPublicSiteOrigin() : '/';

  return (
    <div className="auth-layout">
      <div className="auth-layout-panel">
        {homeHref.startsWith('http') ? (
          <a href={homeHref} className="auth-layout-brand">
            IE Orbit
          </a>
        ) : (
          <Link to={homeHref} className="auth-layout-brand">
            IE Orbit
          </Link>
        )}
        <Outlet />
        <p className="auth-layout-footer">
          <Link to="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
