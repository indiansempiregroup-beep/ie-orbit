import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  DEFAULT_DESCRIPTION,
  ORGANIZATION_NAME,
  PRO_MONTHLY_INR,
  SITE_NAME,
  STARTER_MONTHLY_INR,
  absoluteUrl,
} from './config';
import type { SeoPage } from './pages';

export function organizationSchema(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORGANIZATION_NAME,
    legalName: ORGANIZATION_NAME,
    url: siteUrl,
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE_DISPLAY,
    brand: { '@type': 'Brand', name: SITE_NAME },
    sameAs: [siteUrl],
  };
}

export function webSiteSchema(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl,
    description: DEFAULT_DESCRIPTION,
    inLanguage: 'en-IN',
    publisher: { '@type': 'Organization', name: ORGANIZATION_NAME },
  };
}

export function softwareApplicationSchema(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    description: DEFAULT_DESCRIPTION,
    url: siteUrl,
    offers: [
      {
        '@type': 'Offer',
        name: 'Starter',
        price: String(STARTER_MONTHLY_INR),
        priceCurrency: 'INR',
        description: 'Monthly Starter plan for Orbit Appoint or Orbit Mart.',
      },
      {
        '@type': 'Offer',
        name: 'Pro',
        price: String(PRO_MONTHLY_INR),
        priceCurrency: 'INR',
        description: 'Monthly Pro plan for Orbit Appoint or Orbit Mart.',
      },
    ],
  };
}

export function breadcrumbSchema(page: SeoPage, siteUrl: string) {
  const items = page.breadcrumb ?? [];
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, siteUrl),
    })),
  };
}

export function faqPageSchema(entries: Array<{ q: string; a: string }>) {
  if (!entries.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export function schemasForPage(
  page: SeoPage,
  siteUrl: string,
  faqEntries: Array<{ q: string; a: string }> = [],
): object[] {
  const kinds = page.schemas ?? [];
  const out: object[] = [];
  if (kinds.includes('organization')) out.push(organizationSchema(siteUrl));
  if (kinds.includes('website')) out.push(webSiteSchema(siteUrl));
  if (kinds.includes('software')) out.push(softwareApplicationSchema(siteUrl));
  if (kinds.includes('faq') && faqEntries.length) {
    const faq = faqPageSchema(faqEntries);
    if (faq) out.push(faq);
  }
  if (kinds.includes('breadcrumb')) {
    const crumbs = breadcrumbSchema(page, siteUrl);
    if (crumbs) out.push(crumbs);
  }
  return out;
}
