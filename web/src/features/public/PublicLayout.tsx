import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../../components/Button';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/faq', label: 'FAQ' },
];

export function PublicLayout() {
  const location = useLocation();

  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="AppointIE home">
            <span className="public-brand-mark" aria-hidden="true">A</span>
            <span>
              <strong>AppointIE</strong>
              <small>by Indians Empire</small>
            </span>
          </Link>
          <nav className="public-nav" aria-label="Main navigation">
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
            <Link to="/auth/register/start">
              <Button variant="primary">Start free trial</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <strong>AppointIE</strong>
            <p>Modern appointment scheduling for service businesses.</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <p className="public-footer-copy">© {new Date().getFullYear()} Indians Empire Technologies</p>
        </div>
      </footer>
    </div>
  );
}
