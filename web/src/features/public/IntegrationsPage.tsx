import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

const integrations = [
  {
    title: 'UPI and payment claims',
    body: 'Your IE Orbit subscription is billed in INR. Pay with UPI from the workspace, then submit a UTR or screenshot so the team can confirm the claim.',
  },
  {
    title: 'Razorpay',
    body: 'On eligible Orbit Mart Pro plans, connect your own Razorpay account so customers pay you for shop orders. Platform subscription billing stays on UPI claims.',
  },
  {
    title: 'Cashfree',
    body: 'Cashfree is available as a payment method in product feature flags and POS payment options where enabled for the workspace.',
  },
  {
    title: 'Google Sign-In',
    body: 'Owners can continue with Google during registration. The same Web OAuth client is used on the public site and ops apps.',
  },
  {
    title: 'Google Maps and Places',
    body: 'Office and business addresses use Google Maps / Places pickers so locations can be stored with a map pin.',
  },
  {
    title: 'Google Calendar',
    body: 'Calendar connections sync eligible booking workflows with Google Calendar where the workspace has connected an account.',
  },
  {
    title: 'Google Analytics',
    body: 'Public marketing pages may load Google Analytics 4 when a measurement ID is configured. Analytics is not loaded on Platform Admin, sign-in, or workspace app routes.',
  },
  {
    title: 'Google Ads (AdMob)',
    body: 'Starter plans may show Google Ads (AdMob) in the white-label customer app. Pro is ad-free. AdMob is not used in the owner and staff ops app.',
  },
  {
    title: 'Firebase Cloud Messaging',
    body: 'Push notifications use Firebase Cloud Messaging for apps that have notification permission — the ops app and the white-label customer app, where configured.',
  },
  {
    title: 'WhatsApp (Grow)',
    body: 'Orbit Mart Pro Grow includes a default WhatsApp message and share links so shops can message from operations — not a separate WhatsApp BSP product page. Starter includes calculators only.',
  },
  {
    title: 'Porter and Shiprocket',
    body: 'Instant delivery uses Porter or Shiprocket Quick where you configure credentials in shop delivery settings.',
  },
  {
    title: 'GST e-invoice and e-way',
    body: 'Orbit Mart Pro includes GST reports, e-invoice (IRN), and e-way bill as part of the retail product — not a third-party add-on SKU. Starter is counter, day-book, online orders, and returns.',
  },
];

export function IntegrationsPage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">What is actually connected</p>
            <h1>
              Integrations in <span className="public-gradient-text">IE Orbit</span>
            </h1>
            <p className="public-lead">
              These are connections that exist in the product today: workspace links you can enable, and platform
              services we use for analytics, ads on Starter, and push. The customer-facing app is white-label on every
              plan. We do not list hypothetical marketplaces or invent partner badges.
            </p>
            <div className="public-hero-actions">
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="primary">Create account</Button>
              </Link>
              <Link to="/features">
                <Button variant="neutral">Features</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path="/integrations" />
        <div className="public-product-grid">
          {integrations.map((item) => (
            <article key={item.title} className="public-card">
              <h2 style={{ fontSize: '1.25rem' }}>{item.title}</h2>
              <p style={{ marginBottom: 0 }}>{item.body}</p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 24, color: 'var(--pub-muted)' }}>
          How these processors handle data is in the <Link to="/privacy">Privacy Policy</Link> and{' '}
          <Link to="/cookies">Cookie Policy</Link>.
        </p>
      </div>
      <PublicCtaBand />
    </>
  );
}
