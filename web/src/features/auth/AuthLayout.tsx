import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { BrandLockup } from '../../components/BrandLockup';
import { captureAffiliateCodeFromLocation } from '../onboarding/affiliateCode';
import { adminAppIsSeparateHost, getPublicSiteOrigin, isAdminAppHost } from '../../lib/hosts';

function HomeBrand({ href, light }: { href: string; light?: boolean }) {
  const className = `ops-login-brand${light ? ' ops-login-brand--light' : ''}`;
  const inner = <BrandLockup />;
  if (href.startsWith('http')) {
    return (
      <a href={href} className={className} aria-label="IE Orbit home">
        {inner}
      </a>
    );
  }
  return (
    <Link to={href} className={className} aria-label="IE Orbit home">
      {inner}
    </Link>
  );
}

export function AuthLayout() {
  const location = useLocation();
  useEffect(() => {
    captureAffiliateCodeFromLocation();
  }, []);

  const homeHref =
    adminAppIsSeparateHost() && isAdminAppHost() ? getPublicSiteOrigin() : '/';

  if (location.pathname === '/auth') {
    return (
      <div className="ops-login">
        <header className="ops-login-hero">
          <HomeBrand href={homeHref} light />
          <p className="ops-login-tagline ops-login-tagline--light">Manage your business on the go</p>
        </header>
        <div className="ops-login-panel">
          <div className="ops-login-desktop-brand">
            <HomeBrand href={homeHref} />
            <p className="ops-login-tagline">Manage your business on the go</p>
          </div>
          <Outlet />
        </div>
      </div>
    );
  }

  const otherBrand: ReactNode = homeHref.startsWith('http') ? (
    <a href={homeHref} className="auth-layout-brand" aria-label="IE Orbit home">
      <BrandLockup />
    </a>
  ) : (
    <Link to={homeHref} className="auth-layout-brand" aria-label="IE Orbit home">
      <BrandLockup />
    </Link>
  );

  return (
    <div className="auth-layout">
      <div className="auth-layout-panel">
        {otherBrand}
        <Outlet />
        <p className="auth-layout-footer">
          <Link to="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
