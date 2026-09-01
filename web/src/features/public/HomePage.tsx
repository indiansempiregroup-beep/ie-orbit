import { Link } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  IndianRupee,
  Smartphone,
  Store,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PublicCtaBand } from './PublicCtaBand';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

const products = [
  {
    kicker: 'Orbit Appoint',
    title: 'Appointments for service businesses',
    body: 'Online bookings, calendar, staff, customers, and reviews. Pro adds full business intelligence and reward points.',
    points: ['Online bookings from any device', 'Staff calendar and availability', 'Customers, reminders, and reviews'],
    icon: CalendarDays,
    to: '/features',
  },
  {
    kicker: 'Orbit Mart',
    title: 'Retail, POS, and GST books',
    body: 'Counter sales, catalog, orders and returns, GST books, and Grow tools. Add the Pets pack when you need pet records.',
    points: ['POS and GST counter sales', 'Catalog, orders, and returns', 'Books, e-invoice, and Grow tools'],
    icon: Store,
    to: '/features',
    teal: true,
  },
];

const sharedBenefits = [
  {
    title: 'White-label customer app',
    body: 'Let customers book, shop, and manage orders in an app branded to your business.',
    icon: Smartphone,
  },
  {
    title: 'Business intelligence',
    body: 'Start with Overview on Starter. Unlock Growth, Revenue, Forecast, and Reports on Pro.',
    icon: BarChart3,
  },
  {
    title: 'UPI billing',
    body: 'Pay with UPI, then claim the payment from your workspace. No credit card required to start.',
    icon: IndianRupee,
  },
  {
    title: 'Grow when you need to',
    body: 'Add extra staff and offices as you scale. Yearly billing is 10× monthly — two months free.',
    icon: TrendingUp,
  },
];

const steps = [
  { title: 'Create your workspace', body: 'Sign up, add your business profile, and invite your team.' },
  { title: 'Pick your products', body: 'Choose Orbit Appoint, Orbit Mart, or both in the same workspace.' },
  { title: 'Go live in minutes', body: 'Start the 15-day full-Pro trial and run bookings or the counter today.' },
];

export function HomePage() {
  usePageMeta({
    title: 'IE Orbit — Orbit Appoint and Orbit Mart for Indian businesses',
    description:
      'One workspace for appointments and retail. Orbit Appoint for bookings, Orbit Mart for POS, GST books, and Grow. Start a 15-day free trial.',
  });

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner">
          <div>
            <p className="public-badge">15-day full-Pro trial</p>
            <h1>
              One workspace for <span className="public-gradient-text">appointments and retail</span>
            </h1>
            <p className="public-lead">
              Orbit Appoint runs bookings and staff. Orbit Mart runs the counter, catalog, and GST books. Start with a
              15-day full-Pro trial, then pick the product — or both — that your business needs.
            </p>
            <div className="public-hero-actions">
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="primary">Create account</Button>
              </Link>
              <Link to="/features">
                <Button variant="neutral">Explore features</Button>
              </Link>
              <Link to="/pricing">
                <Button variant="ghost">See pricing</Button>
              </Link>
            </div>
            <div className="public-chip-row" aria-label="Highlights">
              <span className="public-chip">No credit card to start</span>
              <span className="public-chip">UPI billing</span>
              <span className="public-chip">White-label customer app</span>
              <span className="public-chip">Yearly = 2 months free</span>
            </div>
          </div>
          <div className="public-hero-visual" aria-hidden="true">
            <div className="public-preview public-preview--appoint">
              <div className="public-preview__top">
                <span>Today · Orbit Appoint</span>
                <span>3 visits</span>
              </div>
              <div className="public-preview-slot">
                <span>10:00</span>
                <strong>Haircut · Ananya</strong>
              </div>
              <div className="public-preview-slot is-live">
                <span>11:30</span>
                <strong>Facial · Rahul</strong>
              </div>
              <div className="public-preview-slot">
                <span>14:00</span>
                <strong>Consultation</strong>
              </div>
            </div>
            <div className="public-preview public-preview--mart">
              <div className="public-preview__top">
                <span>Counter · Orbit Mart</span>
                <span>GST incl.</span>
              </div>
              <div className="public-preview-line">
                <span>Shampoo 500ml</span>
                <strong>₹249</strong>
              </div>
              <div className="public-preview-line">
                <span>Pet food 2kg</span>
                <strong>₹890</strong>
              </div>
              <div className="public-preview-total">
                <span>Total</span>
                <strong>₹1,139</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="public-page">
        <div className="public-stats" aria-label="Platform snapshot">
          <div className="public-card public-stat">
            <strong>15 days</strong>
            <span>Full-Pro trial on every new workspace</span>
          </div>
          <div className="public-card public-stat">
            <strong>2 products</strong>
            <span>Appointments and retail in one login</span>
          </div>
          <div className="public-card public-stat">
            <strong>Starter + Pro</strong>
            <span>Add staff and offices as you grow</span>
          </div>
          <div className="public-card public-stat">
            <strong>UPI</strong>
            <span>Pay from India, then claim in the app</span>
          </div>
        </div>

        <section className="public-section" aria-label="Products">
          <div className="public-section__head">
            <p className="public-kicker">Products</p>
            <h2>Pick one product, or run both together</h2>
            <p className="public-lead">Same business, staff, customers, and billing — whether you book services or sell from the counter.</p>
          </div>
          <div className="public-product-grid">
            {products.map((product) => {
              const Icon = product.icon;
              return (
                <Link key={product.kicker} to={product.to} className="public-card-link">
                  <article className="public-card">
                    <div className={`public-card-icon${product.teal ? ' public-card-icon--teal' : ''}`}>
                      <Icon size={22} />
                    </div>
                    <p className="public-kicker">{product.kicker}</p>
                    <h2>{product.title}</h2>
                    <p>{product.body}</p>
                    <ul className="public-list">
                      {product.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="public-section" aria-label="Platform benefits">
          <div className="public-section__head">
            <p className="public-kicker">Platform</p>
            <h2>Built in for every workspace</h2>
          </div>
          <div className="public-grid">
            {sharedBenefits.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="public-card">
                  <div className="public-card-icon">
                    <Icon size={20} />
                  </div>
                  <h3>{item.title}</h3>
                  <p style={{ marginBottom: 0 }}>{item.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="public-section" aria-label="How it works">
          <div className="public-section__head">
            <p className="public-kicker">How it works</p>
            <h2>Live in three steps</h2>
          </div>
          <div className="public-steps">
            {steps.map((step, index) => (
              <article key={step.title} className="public-card public-step">
                <span className="public-step__index">{index + 1}</span>
                <h3>{step.title}</h3>
                <p style={{ marginBottom: 0 }}>{step.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <PublicCtaBand />
    </>
  );
}
