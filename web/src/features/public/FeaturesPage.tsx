import { Link } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  PawPrint,
  Sparkles,
  Store,
} from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

const featureGroups = [
  {
    kicker: 'Orbit Appoint',
    title: 'Bookings and daily operations',
    lead: 'Built for salons, clinics, trainers, and other appointment-based teams.',
    icon: CalendarDays,
    items: [
      'Online bookings from any device',
      'Calendar and staff scheduling',
      'Customers, services, and reviews',
      'Pro adds full BI and reward points (earn and redeem)',
    ],
  },
  {
    kicker: 'Orbit Mart Commerce',
    title: 'Counter, catalog, and orders',
    lead: 'Run the shop floor and online orders from the same workspace.',
    icon: Store,
    teal: true,
    items: [
      'POS / GST counter sales',
      'Product catalog and inventory',
      'Online orders with pickup and delivery',
      'Returns, delivery zones, and shop loyalty',
    ],
  },
  {
    kicker: 'Orbit Mart Books',
    title: 'Accounting and GST compliance',
    lead: 'Keep sales, purchases, and GST in one books suite — not a separate product.',
    icon: BookOpen,
    teal: true,
    items: [
      'Sales, purchases, cash and bank, expenses',
      'Parties, quotations, stock, godowns, and challans',
      'GST reports, e-invoice (IRN), and e-way bill',
      'Cheques and loans when you need them',
    ],
  },
  {
    kicker: 'Orbit Mart Grow',
    title: 'Marketing helpers for the shop',
    lead: 'Share, list, and calculate without leaving operations.',
    icon: Sparkles,
    teal: true,
    items: [
      'WhatsApp default message and share links',
      'AI promo poster and share',
      'Google Profile listing helpers',
      'GST, margin, discount, and EMI calculators',
    ],
  },
  {
    kicker: 'Pets pack',
    title: 'Optional add-on for pet retailers',
    lead: 'Not included in the Orbit Mart base plan — add it when you keep pet records.',
    icon: PawPrint,
    items: [
      'Pet records for shops that need them',
      'Priced as a monthly Orbit Mart add-on',
      'Works alongside catalog, POS, and orders',
    ],
  },
  {
    kicker: 'Platform',
    title: 'Shared across Orbit Appoint and Orbit Mart',
    lead: 'One workspace, one trial, and the same billing for both products.',
    icon: BarChart3,
    items: [
      '15-day full-Pro trial, then upgrade to keep running',
      'Starter and Pro plans, with extra staff and office add-ons',
      'White-label customer app for booking and shop',
      'Business intelligence: Overview on Starter, full suite on Pro',
    ],
  },
];

export function FeaturesPage() {
  usePageMeta({
    title: 'Features — IE Orbit',
    description:
      'Orbit Appoint bookings and Orbit Mart commerce, GST books, Grow tools, and Pets pack — one workspace for service and retail businesses.',
  });

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Orbit Appoint · Orbit Mart</p>
            <h1>
              Features for <span className="public-gradient-text">service and retail</span> businesses
            </h1>
            <p className="public-lead">
              Orbit Appoint covers appointments. Orbit Mart covers the counter, books, and Grow. Use one product or both
              in the same workspace.
            </p>
            <div className="public-hero-actions">
              <Link to="/pricing">
                <Button variant="primary">See pricing</Button>
              </Link>
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="neutral">Create account</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <div className="public-product-grid">
          {featureGroups.map((group) => {
            const Icon = group.icon;
            return (
              <article key={group.title} className="public-card">
                <div className={`public-card-icon${group.teal ? ' public-card-icon--teal' : ''}`}>
                  <Icon size={22} />
                </div>
                <p className="public-kicker">{group.kicker}</p>
                <h2 style={{ fontSize: '1.25rem' }}>{group.title}</h2>
                <p>{group.lead}</p>
                <ul className="public-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
      <PublicCtaBand title="Try every Pro feature for 15 days" />
    </>
  );
}
