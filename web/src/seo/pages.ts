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
    title: 'IE Orbit — Orbit Appoint and Orbit Mart for Indian businesses',
    description:
      'One workspace for appointments and retail. Orbit Appoint for bookings and staff, Orbit Mart for POS, GST books, and Grow. Start a 15-day full-Pro trial with UPI billing.',
    index: true,
    schemas: ['organization', 'website', 'software'],
  },
  {
    path: '/features',
    title: 'Features — Orbit Appoint bookings and Orbit Mart POS & GST',
    description:
      'Orbit Appoint covers online bookings, calendar, staff, and reviews. Orbit Mart covers POS, catalog, online orders, GST books, e-invoice, Grow tools, and an optional Pets pack.',
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
      'INR pricing for Orbit Appoint and Orbit Mart. 15-day full-Pro trial with no credit card, then Starter and Pro plans plus staff, office, and Pets pack add-ons. Pay with UPI.',
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
      'IE Orbit for salons and spas, clinics, fitness studios, professional services, retail shops, education, and home services. Bookings, POS, and GST books in one workspace.',
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
      'Run salon and spa appointments, staff calendars, and retail POS from one workspace. Online booking, reminders, reviews, GST counter sales, and a 15-day full-Pro trial.',
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
      'Schedule clinic visits, manage practitioners, and keep patient-facing bookings online. Pair with Orbit Mart for pharmacy-style retail, GST books, and a 15-day trial.',
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
      'Book trainers, classes, and wellness sessions with Orbit Appoint. Sell memberships or retail from Orbit Mart POS with GST books. 15-day full-Pro trial, UPI billing.',
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
      'Let clients book consultations online. Manage staff availability, reminders, and reviews in Orbit Appoint. Add Orbit Mart if you also sell products. 15-day trial.',
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
      'Run counter sales, catalog, online orders, returns, GST books, e-invoice, and e-way bill in Orbit Mart. Optional Pets pack for pet retailers. 15-day full-Pro trial.',
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
      'Schedule classes, coaching, and training sessions with Orbit Appoint. Sell materials from Orbit Mart when you need a counter and GST books. 15-day full-Pro trial.',
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
      'Book on-site visits, manage staff calendars, and keep customer records in Orbit Appoint. Use Orbit Mart if you also sell parts or products with GST invoicing.',
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
      'IE Orbit connects to Razorpay, Cashfree, UPI payment claims, Google Sign-In, Maps, Calendar, WhatsApp Grow tools, Shiprocket, and GST e-invoice / e-way bill.',
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
      'IE Orbit is the appointments-and-retail workspace from Indians Empire Technologies — Orbit Appoint and Orbit Mart for Indian service and shop businesses.',
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
      'Contact Indians Empire Technologies about Orbit Appoint and Orbit Mart. Email support@indiansempire.com or call +91 9766855617. We reply within two business days.',
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
      'Answers about IE Orbit products, 15-day trials, Starter and Pro plans, UPI billing, add-ons, the customer app, and support for Indian businesses.',
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
      'How IE Orbit collects and uses account, business, booking, and retail data to operate Orbit Appoint and Orbit Mart workspaces.',
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
      'Terms for using IE Orbit, including Orbit Appoint and Orbit Mart trials, paid subscriptions, UPI billing, and acceptable use.',
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
      'How IE Orbit uses cookies and similar storage for authentication, session, and optional Google Analytics on the public website.',
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
      'IE Orbit customer apps are white-label apps branded to each business. Owners and staff use the ops workspace. Start on the web with a 15-day trial.',
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
    description: 'Create an IE Orbit workspace for Orbit Appoint and Orbit Mart.',
    index: false,
  },
  {
    path: '/auth/register/start',
    title: 'Create account — IE Orbit',
    description: 'Self-service business onboarding for Orbit Appoint and Orbit Mart.',
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
  if (path.startsWith('/auth/register')) return true;
  if (path.startsWith('/onboarding')) return true;
  return false;
}
