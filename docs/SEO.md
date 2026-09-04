# IE Orbit SEO

## Architecture

The public marketing site is the Vite React SPA in `web/`, served at `https://ie-orbit.com`.

SEO is centralized under `web/src/seo/`:

| File | Role |
|------|------|
| `config.ts` | Site name, defaults, contact, prices |
| `pages.ts` | Per-route title, description, indexability, breadcrumbs |
| `schema.ts` | JSON-LD builders |
| `headHtml.ts` | Head injection helpers |
| `build.ts` | Build-time robots/sitemap/HTML render |
| `analytics.ts` | GA4 gated to marketing host/paths |
| `SeoRuntime.tsx` | Client route meta + pageviews |

At build time, `vite-plugin-seo.ts` writes:

- `dist/index.html` (home meta)
- `dist/{path}/index.html` for each marketing page
- `dist/robots.txt`
- `dist/sitemap.xml`

## Indexing

**Index:** marketing pages listed in `MARKETING_PAGES` (home, features, industries, pricing, FAQ, legal, download, integrations, help listing).

**Noindex:** `/auth*`, `/onboarding*`, dashboard/admin app routes, `/403`, `/404`, Help search (`/help?q=`).

Register/signup stays public but **noindex**.

## Google Analytics 4

- Measurement ID: `G-3Z5PSGMWJW`
- Env: `VITE_GA_MEASUREMENT_ID`
- Loads only on the public marketing host and marketing paths (not Platform Admin, not auth)
- Rebuild nginx after changing the env var

## Google Search Console

Domain verification is already done via **DNS TXT at InterServer**. Do not add an HTML meta verification tag.

After deploy:

1. Open Search Console for `ie-orbit.com`
2. Sitemaps → submit `https://ie-orbit.com/sitemap.xml`
3. Use URL Inspection on key pages (`/`, `/features`, `/industries/salon-spa`)

## Bing Webmaster

Optional follow-up: import the same sitemap after the site is live with robots/sitemap.

## Manual TODOs

- Add company registered address / CIN / GSTIN if Organization schema should include them
- Confirm whether any alternate phone numbers should appear (site standard is `+91 9766855617`)
- Publish Help CMS articles (then they become crawlable at `/help/:slug`)
- Blog only when real editorial content exists
- Google Business Profile only if there is a real public office

## Testing

```bash
pnpm --dir web build
pnpm --dir web seo:check
pnpm --dir web lint
```

## Monthly checklist

- Organic clicks, impressions, CTR, average position (GSC)
- Indexed pages / crawl errors
- Core Web Vitals (CrUX / PageSpeed)
- Top landing pages and conversions (GA4: `generate_lead`, pricing CTAs)
- Confirm sitemap still returns 200
