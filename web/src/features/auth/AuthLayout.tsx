import { Link, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { captureAffiliateCodeFromLocation, registerStartPath } from '../onboarding/affiliateCode';

export function AuthLayout() {
  useEffect(() => {
    captureAffiliateCodeFromLocation();
  }, []);

  return (
    <div className="auth-layout">
      <div className="auth-layout-panel">
        <Link to="/" className="auth-layout-brand">
          IE Orbit
        </Link>
        <Outlet />
        <p className="auth-layout-footer">
          <Link to={registerStartPath()}>Create a workspace</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
