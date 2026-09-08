import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { BrandLockup } from '../../components/BrandLockup';
import { Button } from '../../components/Button';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';

const primaryNavLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/industries', label: 'Industries' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/faq', label: 'FAQ' },
];

const moreNavLinks = [
  { to: '/help', label: 'Help Center' },
  { to: '/integrations', label: 'Integrations' },
];

const footerColumns = [
  {
    title: 'Product',
    links: [
      { to: '/features', label: 'Features' },
      { to: '/industries', label: 'Industries' },
      { to: '/integrations', label: 'Integrations' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/faq', label: 'FAQ' },
      { to: '/help', label: 'Help Center' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
      { to: '/download', label: 'Apps' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: '/cookies', label: 'Cookies' },
    ],
  },
];

export function PublicLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = moreNavLinks.some((link) => location.pathname === link.to);

  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  return (
    <div className="public-layout">
      <a className="public-skip" href="#public-main">
        Skip to content
      </a>
      <header className={`public-header${menuOpen ? ' is-open' : ''}`}>
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="IE Orbit home">
            <BrandLockup />
          </Link>
          <button
            type="button"
            className="public-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="public-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className="public-nav" id="public-nav" aria-label="Main navigation">
            {primaryNavLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={location.pathname === link.to ? 'active' : undefined}
                aria-current={location.pathname === link.to ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <div
              className={`public-nav-more${moreOpen ? ' is-open' : ''}${moreActive ? ' is-active' : ''}`}
              ref={moreRef}
            >
              <button
                type="button"
                className="public-nav-more-toggle"
                aria-expanded={moreOpen}
                aria-controls="public-nav-more"
                onClick={() => setMoreOpen((open) => !open)}
              >
                More
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="public-nav-more-panel" id="public-nav-more">
                {moreNavLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={location.pathname === link.to ? 'active' : undefined}
                    aria-current={location.pathname === link.to ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
          <div className="public-header-actions">
            <Link to="/auth" className="public-signin-link">
              Sign in
            </Link>
            <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE} onClick={() => trackEvent('generate_lead', { method: 'header_create_account' })}>
              <Button variant="primary">Create account</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="public-main" id="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <Link to="/" className="public-brand" aria-label="IE Orbit home">
              <BrandLockup />
            </Link>
            <p>One workspace for appointments and retail — Orbit Appoint and Orbit Mart, built for Indian businesses.</p>
          </div>
          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <strong>{column.title}</strong>
              {column.links.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
          <p className="public-footer-copy">© {new Date().getFullYear()} Indians Empire Technologies</p>
        </div>
      </footer>
    </div>
  );
}
