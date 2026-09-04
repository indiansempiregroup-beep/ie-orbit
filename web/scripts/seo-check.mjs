#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pagesFile = fs.readFileSync(path.join(root, 'src/seo/pages.ts'), 'utf8');
const errors = [];

function fail(message) {
  errors.push(message);
}

const marketingSection = pagesFile.split('export const NOINDEX_PAGES')[0] ?? pagesFile;
const pageBlocks = [
  ...marketingSection.matchAll(/path:\s*'([^']+)'[\s\S]*?title:\s*'([^']+)'[\s\S]*?description:\s*\n?\s*'([^']+)'/g),
];
if (pageBlocks.length < 10) {
  fail(`Could not parse enough marketing pages from pages.ts (got ${pageBlocks.length})`);
}

const titles = new Map();
const descriptions = new Map();
const paths = [];
for (const match of pageBlocks) {
  const [, pagePath, title, description] = match;
  paths.push(pagePath);
  if (!title) fail(`Missing title: ${pagePath}`);
  if (!description) fail(`Missing description: ${pagePath}`);
  if (titles.has(title)) fail(`Duplicate title "${title}" on ${pagePath} and ${titles.get(title)}`);
  else titles.set(title, pagePath);
  if (descriptions.has(description)) {
    fail(`Duplicate description on ${pagePath} and ${descriptions.get(description)}`);
  } else descriptions.set(description, pagePath);
}

const publicDir = path.join(root, 'src/features/public');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/Page\.tsx$|HubPage\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const file of walk(publicDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const count = (text.match(/<h1[\s>]/g) ?? []).length;
  const rel = path.relative(root, file);
  if (count === 0) fail(`Missing <h1> in ${rel}`);
  if (count > 1) fail(`Multiple <h1> (${count}) in ${rel}`);
}

if (fs.existsSync(dist)) {
  const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
  if (!robots.includes('Sitemap:')) fail('robots.txt missing Sitemap');
  if (robots.includes('Disallow: /assets')) fail('robots.txt appears to block assets');
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  for (const required of ['/features', '/pricing', '/industries', '/faq', '/industries/salon-spa', '/integrations', '/cookies', '/download']) {
    if (!sitemap.includes(required)) fail(`sitemap missing ${required}`);
  }
  const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  for (const token of ['rel="canonical"', 'og:title', 'twitter:card', 'application/ld+json']) {
    if (!home.includes(token)) fail(`dist/index.html missing ${token}`);
  }
  if (!fs.existsSync(path.join(dist, 'features/index.html'))) fail('missing dist/features/index.html');
  if (!fs.existsSync(path.join(dist, 'industries/salon-spa/index.html'))) {
    fail('missing dist/industries/salon-spa/index.html');
  }
} else {
  console.warn('seo-check: dist/ not found — skipping generated HTML checks (run after build).');
}

if (errors.length) {
  console.error('SEO check failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`SEO check passed (${paths.length} marketing pages).`);
