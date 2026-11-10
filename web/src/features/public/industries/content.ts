import {
  asRecord,
  asRecordArray,
  asString,
  asStringArray,
  objectReader,
  readEnglishCatalog,
  type TranslateFn,
} from '../translate';

export type IndustryFaq = { q: string; a: string };

export type IndustryProduct = 'appoint' | 'mart';

/** Non-translatable structure: routing, product mix, assets, related links. Copy lives in i18n. */
export type IndustryMeta = {
  slug: string;
  path: string;
  products: IndustryProduct[];
  cardGif: string;
  related: string[];
};

export type IndustryCopy = {
  name: string;
  h1: string;
  lead: string;
  problemTitle: string;
  problem: string;
  solutionTitle: string;
  solution: string;
  featuresTitle: string;
  features: Array<{ title: string; body: string }>;
  workflowTitle: string;
  workflow: Array<{ title: string; body: string }>;
  benefitsTitle: string;
  benefits: string[];
  customerTitle: string;
  customer: string;
  businessTitle: string;
  business: string;
  faqs: IndustryFaq[];
};

export type IndustryContent = IndustryMeta & IndustryCopy;

export const INDUSTRY_META: IndustryMeta[] = [
  {
    slug: 'salon-spa',
    path: '/industries/salon-spa',
    products: ['appoint', 'mart'],
    cardGif: '/marketing/industries/salon-spa/card.gif',
    related: ['clinic-healthcare', 'fitness-wellness', 'retail'],
  },
  {
    slug: 'clinic-healthcare',
    path: '/industries/clinic-healthcare',
    products: ['appoint', 'mart'],
    cardGif: '/marketing/industries/clinic-healthcare/card.gif',
    related: ['salon-spa', 'professional-services', 'fitness-wellness'],
  },
  {
    slug: 'fitness-wellness',
    path: '/industries/fitness-wellness',
    products: ['appoint', 'mart'],
    cardGif: '/marketing/industries/fitness-wellness/card.gif',
    related: ['salon-spa', 'education-training', 'professional-services'],
  },
  {
    slug: 'professional-services',
    path: '/industries/professional-services',
    products: ['appoint'],
    cardGif: '/marketing/industries/professional-services/card.gif',
    related: ['education-training', 'clinic-healthcare', 'home-services'],
  },
  {
    slug: 'retail',
    path: '/industries/retail',
    products: ['mart'],
    cardGif: '/marketing/industries/retail/card.gif',
    related: ['salon-spa', 'home-services', 'fitness-wellness'],
  },
  {
    slug: 'education-training',
    path: '/industries/education-training',
    products: ['appoint', 'mart'],
    cardGif: '/marketing/industries/education-training/card.gif',
    related: ['professional-services', 'fitness-wellness', 'home-services'],
  },
  {
    slug: 'home-services',
    path: '/industries/home-services',
    products: ['appoint', 'mart'],
    cardGif: '/marketing/industries/home-services/card.gif',
    related: ['professional-services', 'retail', 'salon-spa'],
  },
];

function titleBodyList(value: unknown): Array<{ title: string; body: string }> {
  return asRecordArray(value).map((item) => ({ title: asString(item.title), body: asString(item.body) }));
}

function buildIndustry(meta: IndustryMeta, read: (key: string) => unknown): IndustryContent {
  const raw = asRecord(read(`public.industries.items.${meta.slug}`)) ?? {};
  return {
    ...meta,
    name: asString(raw.name),
    h1: asString(raw.h1),
    lead: asString(raw.lead),
    problemTitle: asString(raw.problemTitle),
    problem: asString(raw.problem),
    solutionTitle: asString(raw.solutionTitle),
    solution: asString(raw.solution),
    featuresTitle: asString(raw.featuresTitle),
    features: titleBodyList(raw.features),
    workflowTitle: asString(raw.workflowTitle),
    workflow: titleBodyList(raw.workflow),
    benefitsTitle: asString(raw.benefitsTitle),
    benefits: asStringArray(raw.benefits),
    customerTitle: asString(raw.customerTitle),
    customer: asString(raw.customer),
    businessTitle: asString(raw.businessTitle),
    business: asString(raw.business),
    faqs: asRecordArray(raw.faqs).map((item) => ({ q: asString(item.q), a: asString(item.a) })),
  };
}

/** Translated industries for the active language. */
export function getIndustries(t: TranslateFn): IndustryContent[] {
  const read = objectReader(t);
  return INDUSTRY_META.map((meta) => buildIndustry(meta, read));
}

export function getIndustryBySlug(t: TranslateFn, slug: string): IndustryContent | undefined {
  const meta = INDUSTRY_META.find((item) => item.slug === slug);
  return meta ? buildIndustry(meta, objectReader(t)) : undefined;
}

/** Kicker label such as "Orbit Appoint · Orbit Mart" (product names are brand names, reused from nav keys). */
export function industryProductLabel(products: IndustryProduct[], t: TranslateFn): string {
  const appoint = String(t('public.nav.appoint'));
  const mart = String(t('public.nav.mart'));
  if (products.includes('appoint') && products.includes('mart')) return `${appoint} · ${mart}`;
  return products.includes('appoint') ? appoint : mart;
}

/** English industries (SEO JSON-LD / prerender / marketing shots). Same source as the `en` catalog. */
export const INDUSTRIES: IndustryContent[] = INDUSTRY_META.map((meta) => buildIndustry(meta, readEnglishCatalog));

export function industryBySlug(slug: string): IndustryContent | undefined {
  return INDUSTRIES.find((item) => item.slug === slug);
}

export function industryByPath(path: string): IndustryContent | undefined {
  return INDUSTRIES.find((item) => item.path === path);
}
