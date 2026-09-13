import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  IndianRupee,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicProductShot } from './PublicProductShot';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';
import { PRO_MONTHLY_INR, STARTER_MONTHLY_INR } from '../../seo/config';

const paths = [
  {
    kicker: 'I need bookings',
    title: 'Appointments that run themselves.',
    body: 'Let customers find a time, a service, and a reason to come back.',
    tone: 'peach' as const,
    to: '/features#appoint',
  },
  {
    kicker: 'I need ecommerce',
    title: 'A storefront that feels like yours.',
    body: 'Turn your products into an always-open channel your customers can carry.',
    tone: 'blue' as const,
    to: '/features#mart',
  },
  {
    kicker: 'I need both',
    title: 'The full customer experience.',
    body: 'Bookings and orders, joined up under one memorable brand.',
    tone: 'dark' as const,
    to: '/features#both',
  },
];

const differences = [
  { index: '01', title: 'White-label customer app', body: 'Customers install your brand — iOS and Android — not a generic IE Orbit store listing.' },
  { index: '02', title: 'Your brand front and centre', body: 'Bookings, shop, and order tracking under your name.' },
  { index: '03', title: 'Built to grow with you', body: '15-day full-Pro trial, then Starter or Pro with UPI billing.' },
];

const sharedBenefits = [
  {
    title: 'White-label customer app',
    body: 'The reason to pick Orbit over a billing-only tool. Customers book, shop, and track orders in an app that looks like your business.',
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
  { title: 'Choose your starting point', body: 'Tell us how your business grows today — through bookings, products, or both.' },
  { title: 'Make it yours', body: 'Add your business profile, services or catalog, and invite your team.' },
  { title: 'Keep customers close', body: 'They book and shop in your white-label app. You run the floor in the ops workspace.' },
];

export function HomePage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner">
          <div>
            <p className="public-eyebrow">White-label customer app included</p>
            <h1>
              Your brand in their pocket. <span className="public-gradient-text">Not ours.</span>
            </h1>
            <p className="public-lead">
              Every Starter and Pro plan ships a white-label mobile app under your business name. Customers book and
              shop with you — not IE Orbit, not a marketplace. Orbit Appoint for services, Orbit Mart for retail.
            </p>
            <div className="public-hero-actions">
              <Link
                to={registerStartPath()}
                state={REGISTER_FRESH_START_STATE}
                onClick={() => trackEvent('generate_lead', { method: 'home_create_account' })}
              >
                <Button variant="primary">
                  Create account <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/features" className="public-signin-link">
                See how it works
              </Link>
            </div>
            <p className="public-hero-note">White-label app on every plan · 15-day full-Pro trial · UPI · No credit card</p>
          </div>
          <div className="public-hero-visual">
            <div className="public-visual-tag public-visual-tag--one" aria-hidden="true">
              One connected experience
            </div>
            <PublicProductShot slot="hero" loading="eager" />
            <div className="public-visual-tag public-visual-tag--two" aria-hidden="true">
              <span className="public-mini-dot" />
              Your brand, everywhere
            </div>
          </div>
        </div>
      </section>

      <section className="public-path-section" aria-label="Products">
        <div className="public-path-inner">
          <div className="public-section-intro">
            <div>
              <p className="public-kicker">Start with what matters</p>
              <h2>
                One orbit. <em>Your way.</em>
              </h2>
            </div>
            <p>Choose the momentum you need today. Add the rest when you're ready.</p>
          </div>
          <div className="public-path-grid">
            {paths.map((path) => (
              <Link key={path.kicker} to={path.to} className={`public-path-card public-path-card--${path.tone}`}>
                <div className="public-path-card-top">
                  <span>{path.kicker}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </div>
                <h3>{path.title}</h3>
                <p>{path.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="public-dark-band" aria-label="The IE Orbit difference">
        <div className="public-dark-inner public-dark-grid">
          <div>
            <p className="public-kicker" style={{ color: '#fbbf24' }}>
              The IE Orbit difference
            </p>
            <h2>
              Stop renting attention.
              <br />
              <span>Start owning it.</span>
            </h2>
            <p>
              IE Orbit gives you a digital front door under your brand — a white-label customer app — plus Orbit
              Appoint, Orbit Mart, or both, designed around how your customers actually move.
            </p>
            <Link to="/features">
              <Button variant="neutral">Explore the platform</Button>
            </Link>
          </div>
          <div className="public-orbit-stats">
            {differences.map((item) => (
              <div key={item.index}>
                <strong>{item.index}</strong>
                <span>
                  {item.title}
                  <br />
                  {item.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="public-preview-section" aria-label="Workspace preview">
        <div className="public-preview-inner">
          <div className="public-section-intro">
            <div>
              <p className="public-kicker">A better day at work</p>
              <h2>
                Your whole business, <em>in one view.</em>
              </h2>
            </div>
            <p>Owner dashboard and today's appointments, together.</p>
          </div>
          <PublicProductShot slot="workspace" />
        </div>
      </section>

      <div className="public-page">
        <div className="public-stats" aria-label="Platform snapshot">
          <div className="public-card public-stat">
            <strong>15 days</strong>
            <span>Full-Pro trial on every new workspace</span>
          </div>
          <div className="public-card public-stat">
            <strong>White-label</strong>
            <span>Customer app under your brand, on every plan</span>
          </div>
          <div className="public-card public-stat">
            <strong>From ₹{STARTER_MONTHLY_INR}</strong>
            <span>Starter ₹{STARTER_MONTHLY_INR} · Pro ₹{PRO_MONTHLY_INR} per product / month</span>
          </div>
          <div className="public-card public-stat">
            <strong>UPI</strong>
            <span>Pay from India, then claim in the app</span>
          </div>
        </div>

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
            <h2>From idea to your orbit</h2>
          </div>
          <div className="public-steps">
            {steps.map((step, index) => (
              <article key={step.title} className="public-card public-step">
                <span className="public-step__index">0{index + 1}</span>
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
