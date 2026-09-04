# IE Orbit SEO performance notes

## Risks before this work

- CSR SPA with empty shell HTML (titles only after JS)
- No robots.txt / sitemap / canonical / OG / JSON-LD
- Auth and app routes indexable
- Google Fonts via CSS `@import` (render-blocking)
- Marketing routes all `lazy()` (home LCP delay)
- Pricing blank until API returned

## Optimizations implemented

- Build-time per-route HTML head (title, description, canonical, robots, OG, Twitter, JSON-LD)
- robots.txt + sitemap.xml
- Eager `HomePage` import; other marketing pages remain lazy
- Fonts moved to `preconnect` + stylesheet with `display=swap` in `index.html`
- Pricing static fallback (Starter ₹999 / Pro ₹1,999 / add-ons)
- GA4 gated to marketing host/paths only
- nginx exact locations for robots/sitemap; `X-Robots-Tag` on app prefixes

## Remaining risks

- Body content still depends on client JS for non-head crawlers
- Soft 404s (HTTP 200) for unknown SPA paths
- `/help/:slug` body from API
- No historical CWV baseline in-repo
- Admin host shares the same Vite CSS bundle (same fonts)

## Strategy

Prefer additive SEO + head prerender over a framework migration. Revisit SSR/prerender only if Search Console shows thin indexing despite JS rendering.
