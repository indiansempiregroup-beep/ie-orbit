export const SITE_NAME = 'IE Orbit';
export const ORGANIZATION_NAME = 'Indians Empire Technologies';
export const DEFAULT_TITLE = 'IE Orbit — White-label booking and retail apps for Indian businesses';
export const TITLE_TEMPLATE = '%s — IE Orbit';
export const DEFAULT_DESCRIPTION =
  'Your own branded customer app, plus Orbit Appoint bookings and Orbit Mart POS. White-label on every plan. 45-day full-Pro trial, UPI billing, no credit card to start.';
export const DEFAULT_OG_IMAGE_PATH = '/og/default.png';
export const DEFAULT_LOCALE = 'en_IN';
export const DEFAULT_LANGUAGE = 'en';
export const THEME_COLOR = '#1c718f';
export const TWITTER_CARD = 'summary_large_image';
export const CONTACT_EMAIL = 'support@indiansempire.com';
export const CONTACT_PHONE_DISPLAY = '+91 9766855617';
export const CONTACT_PHONE_TEL = '+919766855617';
export const FALLBACK_SITE_URL = 'https://ie-orbit.com';
export const OPS_ANDROID_PACKAGE_ID = 'com.ieorbit.ops';

export const STARTER_MONTHLY_INR = 399;
export const PRO_MONTHLY_INR = 799;
export const STAFF_ADDON_INR = 199;
export const OFFICE_ADDON_INR = 299;
export const PETS_ADDON_INR = 500;
/** Fallback Assistant overage (major units) when public catalog is unavailable. */
export const ASSISTANT_MESSAGE_INR = 0.5;
export const ASSISTANT_CONFIRM_INR = 1;
export const ASSISTANT_MESSAGE_USD = 0.01;
export const ASSISTANT_CONFIRM_USD = 0.02;
export const AI_WALLET_MIN_INR = 0.01;
export const AI_WALLET_MIN_USD = 0.01;
export const ASSISTANT_DAILY_FREE_MESSAGES = 50;
export const ASSISTANT_DAILY_FREE_CONFIRMS = 25;
export const TRIAL_DAYS = 45;

export function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function envUrl(name: string, fallback = ''): string {
  return trimOrigin(String(import.meta.env?.[name] ?? '')) || fallback;
}

/** Public social profiles shown in the footer. Override with VITE_SOCIAL_* env vars. */
export const SOCIAL_LINKS = [
  {
    id: 'instagram',
    label: 'Instagram',
    href: envUrl('VITE_SOCIAL_INSTAGRAM', 'https://www.instagram.com/indiansempire'),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: envUrl('VITE_SOCIAL_LINKEDIN', 'https://www.linkedin.com/company/indians-empire'),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: envUrl('VITE_SOCIAL_FACEBOOK', 'https://www.facebook.com/indiansempire'),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    href: envUrl('VITE_SOCIAL_YOUTUBE', 'https://www.youtube.com/@indiansempire'),
  },
  {
    id: 'x',
    label: 'X',
    href: envUrl('VITE_SOCIAL_X', 'https://x.com/indiansempire'),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    href: envUrl('VITE_SOCIAL_WHATSAPP', `https://wa.me/${CONTACT_PHONE_TEL.replace('+', '')}`),
  },
].filter((link) => Boolean(link.href));

export const OPS_ANDROID_STORE_URL =
  trimOrigin(String(import.meta.env?.VITE_OPS_ANDROID_STORE_URL ?? '')) ||
  `https://play.google.com/store/apps/details?id=${OPS_ANDROID_PACKAGE_ID}&hl=en_IN`;
export const OPS_IOS_STORE_URL =
  trimOrigin(String(import.meta.env?.VITE_OPS_IOS_STORE_URL ?? '')) ||
  'https://apps.apple.com/in/search?term=IE%20Orbit';

export function configuredSiteUrl(): string {
  const fromEnv = trimOrigin(String(import.meta.env?.VITE_PUBLIC_SITE_URL ?? ''));
  if (fromEnv) return fromEnv;
  return FALLBACK_SITE_URL;
}

export function absoluteUrl(pathname: string, siteUrl = configuredSiteUrl()): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (path === '/') return siteUrl;
  return `${siteUrl}${path}`;
}

export function ogImageUrl(siteUrl = configuredSiteUrl()): string {
  return `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
}

export function formatTitle(title: string): string {
  if (title.includes(SITE_NAME)) return title;
  return TITLE_TEMPLATE.replace('%s', title);
}
