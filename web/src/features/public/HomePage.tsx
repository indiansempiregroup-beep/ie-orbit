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
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';

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
  { index: '01', title: 'Your brand front and centre', body: 'White-label customer app branded to your business.' },
  { index: '02', title: 'Every customer in one orbit', body: 'Bookings, orders, and the same customer record.' },
  { index: '03', title: 'Built to grow with you', body: '15-day full-Pro trial, then Starter or Pro with UPI billing.' },
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
  { title: 'Choose your starting point', body: 'Tell us how your business grows today — through bookings, products, or both.' },
  { title: 'Make it yours', body: 'Add your business profile, services or catalog, and invite your team.' },
  { title: 'Keep customers close', body: 'Start the 15-day full-Pro trial and run bookings or the counter today.' },
];

const bookings = [
  { initials: 'NS', name: 'Nisha Shah', detail: 'Haircut + styling · 10:30', status: 'Confirmed', tone: 'peach' },
  { initials: 'AK', name: 'Arjun Kapoor', detail: 'Consultation · 11:15', status: 'Pending', tone: 'blue' },
  { initials: 'RM', name: 'Rhea Mehta', detail: 'Premium package · 12:30', status: 'Confirmed', tone: 'purple' },
];

export function HomePage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner">
          <div>
            <p className="public-eyebrow">Business, reimagined</p>
            <h1>
              Make your business <span className="public-gradient-text">impossible to forget.</span>
            </h1>
            <p className="public-lead">
              Launch a branded booking and ecommerce experience your customers will love to return to — Orbit Appoint
              for services, Orbit Mart for retail. Start a 15-day full-Pro trial. No credit card.
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
            <p className="public-hero-note">15-day full-Pro trial · UPI billing · No credit card to start</p>
          </div>
          <div className="public-hero-visual" aria-hidden="true">
            <div className="public-visual-tag public-visual-tag--one">One connected experience</div>
            <div className="public-preview">
              <div className="public-preview__top">
                <span className="public-preview-brand">ie orbit</span>
                <span className="public-preview-status">● Live</span>
              </div>
              <p className="public-preview-greeting">
                Good morning, Mira <span>✦</span>
              </p>
              <div className="public-preview-hero">
                <small>Your business, in their pocket</small>
                <strong>Book. Shop. Repeat.</strong>
              </div>
              <div className="public-preview-stats">
                <div>
                  <small>Today's bookings</small>
                  <b>24</b>
                  <em>+18%</em>
                </div>
                <div>
                  <small>Orders today</small>
                  <b>18</b>
                  <em>+12%</em>
                </div>
              </div>
            </div>
            <div className="public-visual-tag public-visual-tag--two">
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
              IE Orbit gives you the digital front door your business deserves — Orbit Appoint, Orbit Mart, or both,
              designed around how your customers actually move.
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
          <div className="public-owner-grid">
            <div className="public-owner-panel" aria-hidden="true">
              <div className="public-preview__top">
                <span>Owner dashboard</span>
                <span className="public-preview-status">● Live now</span>
              </div>
              <p className="public-preview-greeting">
                Good morning, Mira <span>✦</span>
              </p>
              <div className="public-metric-grid">
                <div>
                  <small>Revenue today</small>
                  <b>₹42,800</b>
                  <span>↑ 12.8%</span>
                </div>
                <div>
                  <small>Bookings</small>
                  <b>24</b>
                  <span>↑ 8.4%</span>
                </div>
                <div>
                  <small>Orders</small>
                  <b>18</b>
                  <span>↑ 21.2%</span>
                </div>
              </div>
            </div>
            <div className="public-customer-panel" aria-hidden="true">
              <div className="public-preview">
                <div className="public-preview__top">
                  <span className="public-preview-brand">ie orbit</span>
                  <span className="public-preview-status">● Live</span>
                </div>
                <p className="public-preview-label">Appointments · Today</p>
                {bookings.map((row) => (
                  <div key={row.initials} className="public-booking-row">
                    <span className={`public-avatar public-avatar--${row.tone}`}>{row.initials}</span>
                    <div style={{ flex: 1 }}>
                      <b>{row.name}</b>
                      <small style={{ display: 'block', color: '#8291a5' }}>{row.detail}</small>
                    </div>
                    <span className={`public-pill${row.status === 'Pending' ? ' public-pill--yellow' : ''}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
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
