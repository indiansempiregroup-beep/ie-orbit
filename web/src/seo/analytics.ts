import { isAdminAppHost } from '../lib/hosts';
import { isPublicMarketingPathname, normalizePath } from './pages';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getGaMeasurementId(): string {
  return String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
}

export function shouldTrackMarketingAnalytics(pathname: string): boolean {
  if (!getGaMeasurementId()) return false;
  if (typeof window === 'undefined') return false;
  if (isAdminAppHost()) return false;
  const path = normalizePath(pathname);
  if (path.startsWith('/auth') || path.startsWith('/onboarding')) return false;
  if (path.startsWith('/help') && new URLSearchParams(window.location.search).has('q')) return false;
  return isPublicMarketingPathname(path);
}

function loadGtag(id: string) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ie-orbit-gtag')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
  const script = document.createElement('script');
  script.id = 'ie-orbit-gtag';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

export function trackPageView(pathname: string) {
  if (!shouldTrackMarketingAnalytics(pathname)) return;
  const id = getGaMeasurementId();
  loadGtag(id);
  window.gtag?.('event', 'page_view', {
    page_path: pathname,
    page_title: document.title,
    page_location: window.location.href,
  });
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  if (!shouldTrackMarketingAnalytics(window.location.pathname)) return;
  const id = getGaMeasurementId();
  if (!id) return;
  loadGtag(id);
  window.gtag?.('event', name, params);
}
