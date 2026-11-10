import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, ChevronDown, Layers, Menu, ShoppingBag, X } from 'lucide-react';
import { BrandLockup } from '../../components/BrandLockup';
import { Button } from '../../components/Button';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { OpsStoreBadges } from './OpsStoreBadges';
import { PublicContactFab } from './PublicContactFab';
import { PublicSocialIcon } from './PublicSocialIcons';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';
import { SOCIAL_LINKS } from '../../seo/config';
import { IndustryShotRotationProvider } from './IndustryShotRotation';

function productHashActive(pathname: string, hash: string, linkHash: string) {
  if (pathname !== '/features') return false;
  const current = hash === '#ai' || !hash ? '#mart' : hash;
  return current === linkHash;
}

export function PublicLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);
  const productsActive = location.pathname === '/features';

  const primaryNavLinks = useMemo(
    () => [
      { to: '/industries', label: t('public.nav.industries') },
      { to: '/pricing', label: t('public.nav.pricing') },
      { to: '/integrations', label: t('public.nav.integrations') },
      { to: '/about', label: t('public.nav.about') },
      { to: '/contact', label: t('public.nav.contact') },
      { to: '/faq', label: t('public.nav.faq') },
    ],
    [t],
  );

  const productNavLinks = useMemo(
    () => [
      { to: '/features#appoint', hash: '#appoint', label: t('public.nav.appoint') },
      { to: '/features#mart', hash: '#mart', label: t('public.nav.mart') },
      { to: '/features#both', hash: '#both', label: t('public.nav.both') },
    ],
    [t],
  );

  const footerProducts = useMemo(
    () => [
      {
        to: '/features#appoint',
        kicker: t('public.nav.appoint'),
        title: t('public.footer.appointTitle'),
        icon: CalendarDays,
        tone: 'peach' as const,
      },
      {
        to: '/features#mart',
        kicker: t('public.nav.mart'),
        title: t('public.footer.martTitle'),
        icon: ShoppingBag,
        tone: 'blue' as const,
      },
      {
        to: '/features#both',
        kicker: t('public.nav.both'),
        title: t('public.footer.bothTitle'),
        icon: Layers,
        tone: 'yellow' as const,
      },
    ],
    [t],
  );

  const footerColumns = useMemo(
    () => [
      {
        title: t('public.footer.product'),
        links: [
          { to: '/features#appoint', label: t('public.nav.appoint') },
          { to: '/features#mart', label: t('public.nav.mart') },
          { to: '/features#both', label: t('public.nav.both') },
          { to: '/industries', label: t('public.nav.industries') },
          { to: '/integrations', label: t('public.nav.integrations') },
          { to: '/pricing', label: t('public.nav.pricing') },
          { to: '/faq', label: t('public.nav.faq') },
        ],
      },
      {
        title: t('public.footer.company'),
        links: [
          { to: '/about', label: t('public.nav.about') },
          { to: '/contact', label: t('public.nav.contact') },
          { to: '/download', label: t('public.nav.apps') },
        ],
      },
      {
        title: t('public.footer.legal'),
        links: [
          { to: '/privacy', label: t('public.nav.privacy') },
          { to: '/terms', label: t('public.nav.terms') },
          { to: '/cookies', label: t('public.nav.cookies') },
        ],
      },
    ],
    [t],
  );

  useEffect(() => {
    setMenuOpen(false);
    setProductsOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/features') return;
    window.scrollTo(0, 0);
  }, [location.hash, location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!productsOpen) return undefined;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (productsRef.current && !productsRef.current.contains(target)) {
        setProductsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProductsOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [productsOpen]);

  return (
    <IndustryShotRotationProvider>
      <div className="public-layout">
      <a className="public-skip" href="#public-main">
        {t('public.skipToContent')}
      </a>
      <header className={`public-header${menuOpen ? ' is-open' : ''}`}>
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label={t('public.homeAria')}>
            <BrandLockup />
          </Link>
          <button
            type="button"
            className="public-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="public-nav"
            aria-label={menuOpen ? t('public.closeMenu') : t('public.openMenu')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className="public-nav" id="public-nav" aria-label={t('public.mainNav')}>
            <Link
              to="/"
              className={location.pathname === '/' ? 'active' : undefined}
              aria-current={location.pathname === '/' ? 'page' : undefined}
            >
              {t('public.nav.home')}
            </Link>
            <div
              className={`public-nav-more${productsOpen ? ' is-open' : ''}${productsActive ? ' is-active' : ''}`}
              ref={productsRef}
            >
              <button
                type="button"
                className="public-nav-more-toggle"
                aria-expanded={productsOpen}
                aria-controls="public-nav-products"
                onClick={() => setProductsOpen((open) => !open)}
              >
                {t('public.products')}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="public-nav-more-panel public-nav-products-panel" id="public-nav-products">
                {productNavLinks.map((link) => {
                  const active = productHashActive(location.pathname, location.hash, link.hash);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={active ? 'active' : undefined}
                      aria-current={active ? 'page' : undefined}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
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
          </nav>
          <div className="public-header-actions">
            <LanguageSwitcher compact />
            <Link to="/auth" className="public-signin-link">
              {t('public.signIn')}
            </Link>
            <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE} onClick={() => trackEvent('generate_lead', { method: 'header_create_account' })}>
              <Button variant="primary">{t('public.createAccount')}</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="public-main" id="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-brand">
            <Link to="/" className="public-brand" aria-label={t('public.homeAria')}>
              <BrandLockup />
            </Link>
            <p>{t('public.footer.blurb')}</p>
            <nav className="public-footer-social" aria-label={t('public.socialNav')}>
              {SOCIAL_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  className={`public-footer-social-link public-footer-social-link--${link.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  title={link.label}
                >
                  <PublicSocialIcon id={link.id} title={link.label} />
                </a>
              ))}
            </nav>
          </div>
          <div className="public-footer-spotlight" aria-label={t('public.productsDownloads')}>
            <strong>{t('public.footer.startWith')}</strong>
            {footerProducts.map((product) => {
              const Icon = product.icon;
              return (
                <Link
                  key={product.to}
                  to={product.to}
                  className={`public-footer-product public-footer-product--${product.tone}`}
                >
                  <span className="public-footer-product-mark" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className="public-footer-product-copy">
                    <b>{product.kicker}</b>
                    <span>{product.title}</span>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              );
            })}
            <div className="public-footer-download">
              <div className="public-footer-download-copy">
                <b>{t('public.footer.onDevices')}</b>
                <span>{t('public.footer.onDevicesBody')}</span>
              </div>
              <OpsStoreBadges />
            </div>
          </div>
          <div className="public-footer-links">
            {footerColumns.map((column) => (
              <nav key={column.title} className="public-footer-column" aria-label={column.title}>
                <p className="public-footer-column-title">{column.title}</p>
                <div className="public-footer-column-links">
                  {column.links.map((link) => (
                    <Link key={link.to} to={link.to}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </nav>
            ))}
          </div>
          <p className="public-footer-copy">{t('public.footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
      <PublicContactFab />
      </div>
    </IndustryShotRotationProvider>
  );
}
