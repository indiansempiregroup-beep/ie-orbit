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
    title: 'WhatsApp (Grow)',
    body: 'Orbit Mart Grow includes a default WhatsApp message and share links so shops can message from operations — not a separate WhatsApp BSP product page.',
  },
  {
    title: 'Shiprocket',
    body: 'Courier and delivery provider support includes Shiprocket where you configure it for shop fulfillment.',
  },
  {
    title: 'GST e-invoice and e-way',
    body: 'Orbit Mart Books includes GST reports, e-invoice (IRN), and e-way bill tools as part of the retail product — not a third-party add-on SKU.',
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
              These are connections that exist in the product today. We do not list hypothetical marketplaces or invent
              partner badges.
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
      </div>
      <PublicCtaBand />
    </>
  );
}
