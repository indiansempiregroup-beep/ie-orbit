import { INDUSTRY_META, type IndustryMeta } from './industries/content';
import { asString, readEnglishCatalog, type TranslateFn } from './translate';

export type ProductShotSlot = 'hero' | 'workspace' | 'mart' | 'appoint' | 'both';

export type IndustryShotSet = {
  slug: string;
  name: string;
  products: Array<'appoint' | 'mart'>;
  home: string;
  shop: string | null;
  dashboard: string;
  calendar: string | null;
};

export type IndustrySlide = {
  src: string;
  alt: string;
  variant: 'phone' | 'desktop';
  title?: string;
};

function filesFor(industry: Pick<IndustryMeta, 'slug' | 'products'>): Pick<IndustryShotSet, 'home' | 'shop' | 'dashboard' | 'calendar'> {
  if (industry.slug === 'salon-spa') {
    return {
      home: '/marketing/customer-home.png',
      shop: '/marketing/customer-shop.png',
      dashboard: '/marketing/ops-dashboard.png',
      calendar: '/marketing/ops-calendar.png',
    };
  }
  const base = `/marketing/industries/${industry.slug}`;
  return {
    home: `${base}/customer-home.png`,
    shop: industry.products.includes('mart') ? `${base}/customer-shop.png` : null,
    dashboard: `${base}/ops-dashboard.png`,
    calendar: industry.products.includes('appoint') ? `${base}/ops-calendar.png` : null,
  };
}

/** Industry screenshot sets with names from the active language. Asset paths stay in `INDUSTRY_META`. */
export function getIndustryShots(t: TranslateFn): IndustryShotSet[] {
  return INDUSTRY_META.map((meta) => ({
    slug: meta.slug,
    name: asString(t(`public.industries.items.${meta.slug}.name`)),
    products: meta.products,
    ...filesFor(meta),
  }));
}

/** English-only translate (SEO / static export, no i18n runtime). Supports `{{name}}` interpolation. */
const englishShotT: TranslateFn = (key, options) => {
  const value = readEnglishCatalog(key);
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));
};

/** English industries for any static export / SEO use. */
export const INDUSTRY_SHOTS: IndustryShotSet[] = getIndustryShots(englishShotT);

function shotText(t: TranslateFn, key: string, name: string): string {
  return asString(t(`public.industries.shots.${key}`, { name }));
}

export function slideForSlot(industry: IndustryShotSet, slot: ProductShotSlot, t: TranslateFn = englishShotT): IndustrySlide {
  const { name } = industry;
  const workspace = (): IndustrySlide => ({
    src: industry.dashboard,
    alt: shotText(t, 'altWorkspace', name),
    variant: 'desktop',
    title: shotText(t, 'titleHome', name),
  });
  if (slot === 'hero') {
    return {
      src: industry.home,
      alt: shotText(t, 'altHome', name),
      variant: 'phone',
    };
  }
  if (slot === 'mart') {
    if (industry.shop) {
      return {
        src: industry.shop,
        alt: shotText(t, 'altShop', name),
        variant: 'phone',
      };
    }
    return workspace();
  }
  if (slot === 'appoint') {
    if (industry.calendar) {
      return {
        src: industry.calendar,
        alt: shotText(t, 'altCalendar', name),
        variant: 'desktop',
        title: shotText(t, 'titleCalendar', name),
      };
    }
    return workspace();
  }
  return workspace();
}

export function slidesForSlot(
  slot: ProductShotSlot,
  industries: IndustryShotSet[] = INDUSTRY_SHOTS,
  t: TranslateFn = englishShotT,
): IndustrySlide[] {
  return industries.map((industry) => slideForSlot(industry, slot, t));
}
