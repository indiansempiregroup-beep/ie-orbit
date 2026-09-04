import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageMeta } from '../hooks/usePageMeta';
import { configuredSiteUrl } from './config';
import { matchSeoPage, normalizePath } from './pages';
import { jsonLdForPage } from './build';
import { trackPageView } from './analytics';

function upsertJsonLd(items: object[]) {
  document.querySelectorAll('script[data-ie-orbit-jsonld="true"]').forEach((node) => node.remove());
  items.forEach((item) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.ieOrbitJsonld = 'true';
    script.textContent = JSON.stringify(item);
    document.head.appendChild(script);
  });
}

export function SeoRuntime() {
  const location = useLocation();
  const path = normalizePath(location.pathname);
  const searchNoIndex = path === '/help' && new URLSearchParams(location.search).has('q');

  useEffect(() => {
    const page = matchSeoPage(path);
    if (page) {
      applyPageMeta({
        title: page.title,
        description: page.description,
        index: page.index && !searchNoIndex,
        canonicalPath: page.path,
        ogType: page.ogType,
      });
      upsertJsonLd(jsonLdForPage(page, configuredSiteUrl()));
    } else if (path.startsWith('/help/') && path !== '/help') {
      applyPageMeta({
        title: 'Help — IE Orbit',
        description: 'IE Orbit help article.',
        index: true,
        canonicalPath: path,
      });
      upsertJsonLd([]);
    } else {
      applyPageMeta({
        title: document.title || 'IE Orbit',
        index: false,
        canonicalPath: path,
      });
      upsertJsonLd([]);
    }
    trackPageView(path);
  }, [path, location.search, searchNoIndex]);

  return null;
}
