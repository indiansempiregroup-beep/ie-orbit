import { useEffect } from 'react';
import { DEFAULT_OG_IMAGE_PATH, SITE_NAME, THEME_COLOR, TWITTER_CARD, configuredSiteUrl } from '../seo/config';
import { matchSeoPage, normalizePath, type SeoPage } from '../seo/pages';
import { robotsContent } from '../seo/headHtml';

type PageMeta = {
  title: string;
  description?: string;
  index?: boolean;
  canonicalPath?: string;
  ogType?: string;
};

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyPageMeta({ title, description, index = false, canonicalPath, ogType = 'website' }: PageMeta) {
  const siteUrl = configuredSiteUrl();
  const path = canonicalPath ?? (typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/');
  const canonical = path === '/' ? siteUrl : `${siteUrl}${path}`;
  const desc = description ?? '';
  const image = `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
  const robots = robotsContent(index);

  document.title = title;
  document.documentElement.lang = 'en';
  upsertMeta('meta[name="description"]', 'name', 'description', desc);
  upsertMeta('meta[name="robots"]', 'name', 'robots', robots);
  upsertMeta('meta[name="theme-color"]', 'name', 'theme-color', THEME_COLOR);
  upsertLink('canonical', canonical);
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', desc);
  upsertMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
  upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
  upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'en_IN');
  upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', TWITTER_CARD);
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc);
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
}

export function usePageMeta({ title, description, index = false, canonicalPath, ogType }: PageMeta) {
  useEffect(() => {
    applyPageMeta({ title, description, index, canonicalPath, ogType });
  }, [title, description, index, canonicalPath, ogType]);
}

export function useSeoPage(page: SeoPage | undefined, extras?: Partial<PageMeta>) {
  usePageMeta({
    title: extras?.title ?? page?.title ?? SITE_NAME,
    description: extras?.description ?? page?.description,
    index: extras?.index ?? page?.index ?? false,
    canonicalPath: extras?.canonicalPath ?? page?.path,
    ogType: extras?.ogType ?? page?.ogType,
  });
}

export function seoPageForPath(pathname: string): SeoPage | undefined {
  return matchSeoPage(pathname);
}
