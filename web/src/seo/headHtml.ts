import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE_PATH,
  SITE_NAME,
  THEME_COLOR,
  TWITTER_CARD,
  absoluteUrl,
} from './config';
import type { SeoPage } from './pages';

export type AppliedMeta = {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType: string;
  ogImage: string;
};

export function robotsContent(index: boolean): string {
  return index ? 'index, follow' : 'noindex, nofollow';
}

export function appliedMeta(page: SeoPage, siteUrl: string): AppliedMeta {
  return {
    title: page.title,
    description: page.description,
    canonical: absoluteUrl(page.path, siteUrl),
    robots: robotsContent(page.index),
    ogType: page.ogType ?? 'website',
    ogImage: `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`,
  };
}

export function buildHeadSnippet(page: SeoPage, siteUrl: string, jsonLd: object[] = []): string {
  const meta = appliedMeta(page, siteUrl);
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="robots" content="${escapeAttr(meta.robots)}" />`,
    `<link rel="canonical" href="${escapeAttr(meta.canonical)}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:type" content="${escapeAttr(meta.ogType)}" />`,
    `<meta property="og:url" content="${escapeAttr(meta.canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(meta.ogImage)}" />`,
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${DEFAULT_LOCALE}" />`,
    `<meta name="twitter:card" content="${TWITTER_CARD}" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(meta.ogImage)}" />`,
    `<meta name="theme-color" content="${THEME_COLOR}" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.svg" />`,
    `<html lang placeholder>`,
  ];
  const json = jsonLd
    .map((item) => `<script type="application/ld+json">${JSON.stringify(item)}</script>`)
    .join('\n    ');
  return `${tags.filter((tag) => !tag.startsWith('<html')).join('\n    ')}${json ? `\n    ${json}` : ''}`;
}

export function injectDocumentHead(html: string, page: SeoPage, siteUrl: string, jsonLd: object[] = []): string {
  const snippet = buildHeadSnippet(page, siteUrl, jsonLd);
  let next = html.replace(/<title>[^<]*<\/title>/i, '');
  next = next.replace(/<html\s+lang="[^"]*"/i, `<html lang="${DEFAULT_LANGUAGE}"`);
  if (!next.includes(`lang="${DEFAULT_LANGUAGE}"`)) {
    next = next.replace('<html', `<html lang="${DEFAULT_LANGUAGE}"`);
  }
  return next.replace('</head>', `    ${snippet}\n  </head>`);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export function robotsTxt(siteUrl: string, disallow: string[]): string {
  const lines = ['User-agent: *', 'Allow: /', ...disallow.map((path) => `Disallow: ${path}`), '', `Sitemap: ${siteUrl}/sitemap.xml`, ''];
  return lines.join('\n');
}

export function sitemapXml(siteUrl: string, paths: string[], lastmod: string): string {
  const urls = paths
    .map((path) => {
      const loc = absoluteUrl(path, siteUrl);
      const priority = path === '/' ? '1.0' : path.split('/').length > 2 ? '0.7' : '0.8';
      return `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
