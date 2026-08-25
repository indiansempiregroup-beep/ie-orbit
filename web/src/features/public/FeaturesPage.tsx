import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const featureGroups = [
  {
    kicker: 'AppointIE',
    title: 'Bookings and daily operations',
    lead: 'Built for salons, clinics, trainers, and other appointment-based teams.',
    items: [
      'Online bookings from any device',
      'Calendar and staff scheduling',
      'Customers, services, and reviews',
      'Pro adds full BI and reward points (earn and redeem)',
    ],
  },
  {
    kicker: 'ShopIE Commerce',
    title: 'Counter, catalog, and orders',
    lead: 'Run the shop floor and online orders from the same workspace.',
    items: [
      'POS / GST counter sales',
      'Product catalog and inventory',
      'Online orders with pickup and delivery',
      'Returns, delivery zones, and shop loyalty',
    ],
  },
  {
    kicker: 'ShopIE Books',
    title: 'Accounting and GST compliance',
    lead: 'Keep sales, purchases, and GST in one books suite — not a separate product.',
    items: [
      'Sales, purchases, cash and bank, expenses',
      'Parties, quotations, stock, godowns, and challans',
      'GST reports, e-invoice (IRN), and e-way bill',
      'Cheques and loans when you need them',
    ],
  },
  {
    kicker: 'ShopIE Grow',
    title: 'Marketing helpers for the shop',
    lead: 'Share, list, and calculate without leaving operations.',
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
    lead: 'Not included in the ShopIE base plan — add it when you keep pet records.',
    items: [
      'Pet records for shops that need them',
      'Priced as a monthly ShopIE add-on',
      'Works alongside catalog, POS, and orders',
    ],
  },
  {
    kicker: 'Platform',
    title: 'Shared across AppointIE and ShopIE',
    lead: 'One workspace, one trial, and the same billing for both products.',
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
      'AppointIE bookings and ShopIE commerce, GST books, Grow tools, and Pets pack — one workspace for service and retail businesses.',
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Features for service and retail businesses</h1>
        <p className="public-lead">
          AppointIE covers appointments. ShopIE covers the counter, books, and Grow. Use one product or both in the same
          workspace.
        </p>
      </section>
      <div className="public-product-grid">
        {featureGroups.map((group) => (
          <Card key={group.title}>
            <p className="public-kicker">{group.kicker}</p>
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>{group.title}</h2>
            <p style={{ color: 'var(--muted-foreground)' }}>{group.lead}</p>
            <ul className="public-list" style={{ marginBottom: 0 }}>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="public-hero-actions">
        <Link to="/pricing">
          <Button variant="primary">See pricing</Button>
        </Link>
        <Link to="/auth/register/start">
          <Button variant="neutral">Start free trial</Button>
        </Link>
      </div>
    </div>
  );
}
