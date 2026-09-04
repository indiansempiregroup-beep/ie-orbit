import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/industries', label: 'Industries' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/faq', label: 'FAQ' },
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

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className="public-layout">
      <a className="public-skip" href="#public-main">
        Skip to content
      </a>
      <header className={`public-header${menuOpen ? ' is-open' : ''}`}>
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="IE Orbit home">
            <span className="public-brand-mark" aria-hidden="true">
              IE
            </span>
            <span>
              <strong>IE Orbit</strong>
              <small>by Indians Empire</small>
            </span>
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
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={location.pathname === link.to ? 'active' : undefined}
                aria-current={location.pathname === link.to ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="public-header-actions">
            <Link to="/auth">
              <Button variant="ghost">Sign in</Button>
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
            <strong>IE Orbit</strong>
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
