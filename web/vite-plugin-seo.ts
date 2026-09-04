import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { MARKETING_PAGES } from './src/seo/pages';
import { buildRobotsTxt, buildSitemapXml, renderPageHtml, resolveSiteUrl } from './src/seo/build';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));

export function seoHtmlPlugin(siteUrlInput: string): Plugin {
  const siteUrl = resolveSiteUrl(siteUrlInput);
  return {
    name: 'ie-orbit-seo-html',
    closeBundle() {
      const dist = path.resolve(pluginDir, 'dist');
      const indexPath = path.join(dist, 'index.html');
      if (!fs.existsSync(indexPath)) return;
      const template = fs.readFileSync(indexPath, 'utf8');
      const home = MARKETING_PAGES.find((page) => page.path === '/');
      if (home) {
        fs.writeFileSync(indexPath, renderPageHtml(template, home, siteUrl));
      }
      for (const page of MARKETING_PAGES) {
        if (page.path === '/') continue;
        const html = renderPageHtml(template, page, siteUrl);
        const outDir = path.join(dist, page.path.replace(/^\//, ''));
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'index.html'), html);
      }
      fs.writeFileSync(path.join(dist, 'robots.txt'), buildRobotsTxt(siteUrl));
      fs.writeFileSync(path.join(dist, 'sitemap.xml'), buildSitemapXml(siteUrl));
    },
  };
}
