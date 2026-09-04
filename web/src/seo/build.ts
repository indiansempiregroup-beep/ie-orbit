import { faqAnswerText, faqSections } from '../features/public/faqContent';
import { industryByPath } from '../features/public/industries/content';
import { FALLBACK_SITE_URL, trimOrigin } from './config';
import { ROBOTS_DISALLOW, indexablePages, type SeoPage } from './pages';
import { injectDocumentHead, robotsTxt, sitemapXml } from './headHtml';
import { schemasForPage } from './schema';

export function resolveSiteUrl(value?: string): string {
  const configured = trimOrigin(value ?? '');
  return configured || FALLBACK_SITE_URL;
}

export function faqEntriesForPath(path: string): Array<{ q: string; a: string }> {
  if (path === '/faq') {
    return faqSections.flatMap((section) =>
      section.items.map((item) => ({ q: item.q, a: faqAnswerText(item.a) })),
    );
  }
  const industry = industryByPath(path);
  if (industry?.faqs.length) {
    return industry.faqs.map((item) => ({ q: item.q, a: item.a }));
  }
  return [];
}

export function jsonLdForPage(page: SeoPage, siteUrl: string): object[] {
  return schemasForPage(page, siteUrl, faqEntriesForPath(page.path));
}

export function renderPageHtml(template: string, page: SeoPage, siteUrl: string): string {
  return injectDocumentHead(template, page, siteUrl, jsonLdForPage(page, siteUrl));
}

export function buildRobotsTxt(siteUrl: string): string {
  return robotsTxt(siteUrl, ROBOTS_DISALLOW);
}

export function buildSitemapXml(siteUrl: string, lastmod = new Date().toISOString().slice(0, 10)): string {
  return sitemapXml(
    siteUrl,
    indexablePages().map((page) => page.path),
    lastmod,
  );
}
