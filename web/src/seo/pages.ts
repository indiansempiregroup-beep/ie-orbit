export type SeoSchemaKind = 'organization' | 'website' | 'software' | 'faq' | 'breadcrumb';

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  index: boolean;
  sitemap?: boolean;
  ogType?: 'website' | 'article';
  schemas?: SeoSchemaKind[];
  breadcrumb?: Array<{ name: string; path: string }>;
};

export const MARKETING_PAGES: SeoPage[] = [
  {
    path: '/',
    title: 'IE Orbit — White-label booking and retail apps for Indian businesses',
    description:
      'Ship a customer app under your brand — not ours. Orbit Appoint for bookings, Orbit Mart for POS and GST. White-label included on Starter and Pro. 15-day full-Pro trial, UPI billing.',
    index: true,
    schemas: ['organization', 'website', 'software'],
  },
  {
    path: '/features',
    title: 'Features — White-label app, Orbit Appoint, and Orbit Mart',
    description:
      'Every plan includes a white-label customer app branded to your business. Orbit Appoint covers bookings and staff. Orbit Mart covers POS, catalog, online orders, GST books on Pro, and Grow.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Features', path: '/features' },
    ],
  },
  {
    path: '/pricing',
    title: 'Pricing — IE Orbit Starter, Pro, and 15-day trial',
    description:
      'INR pricing for Orbit Appoint and Orbit Mart. White-label customer app on every plan. 15-day full-Pro trial, then Starter ₹399 (one location) and Pro ₹799 (second office, WhatsApp or GST). Extra staff capped on Starter; Pets pack is a Mart add-on.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Pricing', path: '/pricing' },
    ],
  },
  {
    path: '/industries',
    title: 'Industries — Appointment and retail software for Indian businesses',
    description:
      'White-label customer apps for salons, clinics, fitness studios, professional services, retail, education, and home services. Bookings, POS, and GST books in one workspace.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
    ],
  },
  {
    path: '/industries/salon-spa',
    title: 'Salon & Spa Booking Software — Orbit Appoint | IE Orbit',
    description:
      'Give salon clients a white-label app under your brand. Orbit Appoint runs chairs and calendars; Orbit Mart runs retail POS. 15-day full-Pro trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Salon & Spa', path: '/industries/salon-spa' },
    ],
  },
  {
    path: '/industries/clinic-healthcare',
    title: 'Clinic Appointment Software — Orbit Appoint | IE Orbit',
    description:
      'Patients book on your white-label customer app. Orbit Appoint schedules practitioners; pair Orbit Mart for counter retail and GST books. 15-day trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Clinic & Healthcare', path: '/industries/clinic-healthcare' },
    ],
  },
  {
    path: '/industries/fitness-wellness',
    title: 'Fitness & Wellness Booking Software — IE Orbit',
    description:
      'Members book trainers and sessions on your white-label app. Orbit Appoint for the calendar; Orbit Mart for studio retail. 15-day full-Pro trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Fitness & Wellness', path: '/industries/fitness-wellness' },
    ],
  },
  {
    path: '/industries/professional-services',
    title: 'Consultant Booking Software — Professional Services | IE Orbit',
    description:
      'Clients book consultations on your white-label customer app. Staff calendars, reminders, and reviews in Orbit Appoint. Add Orbit Mart if you also sell products.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Professional Services', path: '/industries/professional-services' },
    ],
  },
  {
    path: '/industries/retail',
    title: 'Retail POS and GST Software — Orbit Mart | IE Orbit',
    description:
      'Shoppers browse and order on your white-label app. Orbit Mart runs counter sales, catalog, GST books, e-invoice, and e-way. Optional Pets pack. 15-day trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Retail', path: '/industries/retail' },
    ],
  },
  {
    path: '/industries/education-training',
    title: 'Class & Tutoring Booking Software — IE Orbit',
    description:
      'Learners book classes on your white-label app. Orbit Appoint schedules sessions; Orbit Mart sells materials with GST books. 15-day full-Pro trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Education & Training', path: '/industries/education-training' },
    ],
  },
  {
    path: '/industries/home-services',
    title: 'Home Services Booking Software — IE Orbit',
    description:
      'Households book visits on your white-label app. Orbit Appoint manages staff calendars; Orbit Mart bills parts with GST invoicing. 15-day trial.',
    index: true,
    schemas: ['organization', 'software', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Industries', path: '/industries' },
      { name: 'Home Services', path: '/industries/home-services' },
    ],
  },
  {
    path: '/integrations',
    title: 'Integrations — Razorpay, UPI, Google, WhatsApp, GST | IE Orbit',
    description:
      'IE Orbit connects to Razorpay, Cashfree, UPI payment claims, Google Sign-In, Maps, Calendar, Analytics, AdMob, Firebase, WhatsApp Grow tools, Shiprocket, and GST e-invoice / e-way bill.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Integrations', path: '/integrations' },
    ],
  },
  {
    path: '/about',
    title: 'About Indians Empire Technologies and IE Orbit',
    description:
      'IE Orbit ships a white-label customer app on every plan. Orbit Appoint and Orbit Mart from Indians Empire Technologies for Indian service and shop businesses.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'About', path: '/about' },
    ],
  },
  {
    path: '/contact',
    title: 'Contact IE Orbit — Support, sales, and demos',
    description:
      'Book a demo of the white-label customer app, or ask about Orbit Appoint and Orbit Mart. Email support@indiansempire.com or call +91 9766855617.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Contact', path: '/contact' },
    ],
  },
  {
    path: '/faq',
    title: 'FAQ — IE Orbit trials, pricing, Orbit Appoint, and Orbit Mart',
    description:
      'Answers about the white-label customer app, 15-day trials, Starter and Pro plans, UPI billing, add-ons, and support for Indian businesses.',
    index: true,
    schemas: ['organization', 'faq', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'FAQ', path: '/faq' },
    ],
  },
  {
    path: '/help',
    title: 'Help Center — IE Orbit guides',
    description:
      'Published help articles for Orbit Appoint and Orbit Mart. Search guides or contact support if you need a walkthrough.',
    index: true,
    schemas: ['organization', 'breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Help Center', path: '/help' },
    ],
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — IE Orbit',
    description:
      'How Indians Empire Technologies collects, uses, shares, and retains IE Orbit account, booking, retail, billing, and analytics data, and how to exercise DPDP rights.',
    index: true,
    schemas: ['breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Privacy Policy', path: '/privacy' },
    ],
  },
  {
    path: '/terms',
    title: 'Terms & Conditions — IE Orbit',
    description:
      'Terms for IE Orbit: Orbit Appoint and Orbit Mart, 15-day trial, UPI subscription claims, white-label apps, acceptable use, and Indian governing law.',
    index: true,
    schemas: ['breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Terms', path: '/terms' },
    ],
  },
  {
    path: '/cookies',
    title: 'Cookie Policy — IE Orbit',
    description:
      'Cookies and browser storage IE Orbit uses for sign-in, workspace, preferences, Google Sign-In, Maps, and optional Analytics on public marketing pages.',
    index: true,
    schemas: ['breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Cookies', path: '/cookies' },
    ],
  },
  {
    path: '/download',
    title: 'Download IE Orbit apps — Customer and ops access',
    description:
      'Download the IE Orbit ops app for iOS and Android. Customer apps are white-label and branded to each business. Start on the web with a 15-day trial.',
    index: true,
    schemas: ['breadcrumb'],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Download', path: '/download' },
    ],
  },
];

export const NOINDEX_PAGES: SeoPage[] = [
  { path: '/auth', title: 'Sign in — IE Orbit', description: 'Sign in to your IE Orbit workspace.', index: false },
  {
    path: '/auth/forgot-password',
    title: 'Forgot password — IE Orbit',
    description: 'Reset your IE Orbit password.',
    index: false,
  },
  {
    path: '/auth/reset-password',
    title: 'Reset password — IE Orbit',
    description: 'Choose a new IE Orbit password.',
    index: false,
  },
  {
    path: '/auth/verify-email',
    title: 'Verify email — IE Orbit',
    description: 'Verify your IE Orbit email address.',
    index: false,
  },
  {
    path: '/auth/accept-invitation',
    title: 'Accept invitation — IE Orbit',
    description: 'Accept a staff invitation to an IE Orbit workspace.',
    index: false,
  },
  {
    path: '/auth/register',
    title: 'Register — IE Orbit',
    description: 'Create a white-label IE Orbit workspace for Orbit Appoint and Orbit Mart.',
    index: false,
  },
  {
    path: '/auth/register/start',
    title: 'Create account — IE Orbit',
    description: 'Create a white-label workspace for Orbit Appoint, Orbit Mart, or both. 15-day full-Pro trial.',
    index: false,
  },
  {
    path: '/onboarding/success',
    title: 'Workspace ready — IE Orbit',
    description: 'Your IE Orbit workspace is ready.',
    index: false,
  },
  { path: '/403', title: 'Access denied — IE Orbit', description: 'You do not have access to this page.', index: false },
  { path: '/404', title: 'Page not found — IE Orbit', description: 'This IE Orbit page could not be found.', index: false },
  {
    path: '/open',
    title: 'Open in app — IE Orbit',
    description: 'Open this notification in the customer app or ops workspace.',
    index: false,
  },
];

export const ROBOTS_DISALLOW = [
  '/auth',
  '/onboarding',
  '/dashboard',
  '/admin',
  '/settings',
  '/shop',
  '/customers',
  '/calendar',
  '/bookings',
  '/bi',
  '/profile',
  '/notifications',
  '/open',
  '/staff',
  '/services',
  '/reports',
  '/business',
  '/403',
  '/404',
];

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const stripped = pathname.replace(/\/+$/, '');
  return stripped || '/';
}

export function allSeoPages(): SeoPage[] {
  return [...MARKETING_PAGES, ...NOINDEX_PAGES];
}

export function matchSeoPage(pathname: string): SeoPage | undefined {
  const path = normalizePath(pathname);
  return allSeoPages().find((page) => page.path === path);
}

export function indexablePages(): SeoPage[] {
  return MARKETING_PAGES.filter((page) => page.index && page.sitemap !== false);
}

export function isIndexableMarketingPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path.startsWith('/help/') && path !== '/help') return false;
  const page = matchSeoPage(path);
  return Boolean(page?.index);
}

export const PUBLIC_MARKETING_PATHS = new Set(MARKETING_PAGES.map((page) => page.path));

export function isPublicMarketingPathname(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (PUBLIC_MARKETING_PATHS.has(path)) return true;
  if (path.startsWith('/industries/')) return true;
  if (path.startsWith('/help/')) return true;
  if (path.startsWith('/open/')) return true;
  if (path.startsWith('/auth/register')) return true;
  if (path.startsWith('/onboarding')) return true;
  return false;
}
