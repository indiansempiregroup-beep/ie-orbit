export const SITE_NAME = 'IE Orbit';
export const ORGANIZATION_NAME = 'Indians Empire Technologies';
export const DEFAULT_TITLE = 'IE Orbit — White-label booking and retail apps for Indian businesses';
export const TITLE_TEMPLATE = '%s — IE Orbit';
export const DEFAULT_DESCRIPTION =
  'Your own branded customer app, plus Orbit Appoint bookings and Orbit Mart POS. White-label on every plan. 15-day full-Pro trial, UPI billing, no credit card to start.';
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
export const TRIAL_DAYS = 15;

export function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export const OPS_ANDROID_STORE_URL =
  trimOrigin(String(import.meta.env.VITE_OPS_ANDROID_STORE_URL ?? '')) ||
  `https://play.google.com/store/apps/details?id=${OPS_ANDROID_PACKAGE_ID}&hl=en_IN`;
export const OPS_IOS_STORE_URL =
  trimOrigin(String(import.meta.env.VITE_OPS_IOS_STORE_URL ?? '')) ||
  'https://apps.apple.com/in/search?term=IE%20Orbit';

export function configuredSiteUrl(): string {
  const fromEnv = trimOrigin(String(import.meta.env.VITE_PUBLIC_SITE_URL ?? ''));
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
