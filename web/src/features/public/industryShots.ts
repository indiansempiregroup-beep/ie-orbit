import { INDUSTRIES } from './industries/content';

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

function filesFor(industry: (typeof INDUSTRIES)[number]): Pick<IndustryShotSet, 'home' | 'shop' | 'dashboard' | 'calendar'> {
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

export const INDUSTRY_SHOTS: IndustryShotSet[] = INDUSTRIES.map((industry) => ({
  slug: industry.slug,
  name: industry.name,
  products: industry.products,
  ...filesFor(industry),
}));

export function slideForSlot(industry: IndustryShotSet, slot: ProductShotSlot): IndustrySlide {
  if (slot === 'hero') {
    return {
      src: industry.home,
      alt: `${industry.name} customer app home`,
      variant: 'phone',
    };
  }
  if (slot === 'mart') {
    if (industry.shop) {
      return {
        src: industry.shop,
        alt: `${industry.name} customer shop`,
        variant: 'phone',
      };
    }
    return {
      src: industry.dashboard,
      alt: `${industry.name} ops workspace`,
      variant: 'desktop',
      title: `${industry.name} · Home`,
    };
  }
  if (slot === 'appoint') {
    if (industry.calendar) {
      return {
        src: industry.calendar,
        alt: `${industry.name} appointment calendar`,
        variant: 'desktop',
        title: `${industry.name} · Calendar`,
      };
    }
    return {
      src: industry.dashboard,
      alt: `${industry.name} ops workspace`,
      variant: 'desktop',
      title: `${industry.name} · Home`,
    };
  }
  return {
    src: industry.dashboard,
    alt: `${industry.name} ops workspace home`,
    variant: 'desktop',
    title: `${industry.name} · Home`,
  };
}

export function slidesForSlot(slot: ProductShotSlot): IndustrySlide[] {
  return INDUSTRY_SHOTS.map((industry) => slideForSlot(industry, slot));
}
