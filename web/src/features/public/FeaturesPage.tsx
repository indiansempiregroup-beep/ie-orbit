import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, PawPrint, Sparkles } from 'lucide-react';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBackLink } from './PublicBackLink';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

const TAB_IDS = ['appoint', 'mart', 'both'] as const;
type ProductTabId = (typeof TAB_IDS)[number];

const productTabs: Array<{
  id: ProductTabId;
  label: string;
  kicker: string;
  title: string;
  body: string;
  features: string[];
}> = [
  {
    id: 'appoint',
    label: 'Appoint',
    kicker: 'Orbit Appoint',
    title: 'Bookings without the back-and-forth.',
    body: 'Give customers a beautiful way to discover availability, book instantly, and keep coming back.',
    features: [
      'Smart availability and staff calendars',
      'Automated booking confirmations and reminders',
      'Customer history and reviews in one place',
      'Pro adds full BI and reward points',
    ],
  },
  {
    id: 'mart',
    label: 'Mart',
    kicker: 'Orbit Mart',
    title: 'Your products, in their pocket.',
    body: 'Create a storefront that makes your products easy to browse, buy, and remember — with POS and GST books in the same workspace.',
    features: [
      'Branded product storefront and catalog',
      'POS / GST counter sales',
      'Online orders with pickup and delivery',
      'Books: GST reports, e-invoice, and e-way bill',
    ],
  },
  {
    id: 'both',
    label: 'Both together',
    kicker: 'Orbit Appoint + Orbit Mart',
    title: 'One brand. Every way to buy.',
    body: 'The most complete version of IE Orbit — appointments and ecommerce sharing one customer relationship.',
    features: [
      'Unified customer profiles',
      'Cross-sell bookings and products',
      'White-label customer app for book and shop',
      'One 15-day trial, one workspace, UPI billing',
    ],
  },
];

const extraGroups = [
  {
    kicker: 'Orbit Mart Books',
    title: 'Accounting and GST compliance',
    lead: 'Sales, purchases, cash, GST reports, e-invoice, and e-way bill — not a separate product.',
    icon: BookOpen,
    tone: 'yellow' as const,
  },
  {
    kicker: 'Orbit Mart Grow',
    title: 'Marketing helpers for the shop',
    lead: 'WhatsApp share, promo posters, Google listing helpers, and GST calculators.',
    icon: Sparkles,
    tone: 'purple' as const,
  },
  {
    kicker: 'Pets pack',
    title: 'Optional add-on for pet retailers',
    lead: 'Pet records priced as a monthly Orbit Mart add-on. Not included in the base plan.',
    icon: PawPrint,
    tone: 'peach' as const,
  },
];

const bookings = [
  { initials: 'NS', name: 'Nisha Shah', detail: 'Haircut + styling · 10:30', status: 'Confirmed', tone: 'peach' },
  { initials: 'AK', name: 'Arjun Kapoor', detail: 'Consultation · 11:15', status: 'Pending', tone: 'blue' },
  { initials: 'RM', name: 'Rhea Mehta', detail: 'Premium package · 12:30', status: 'Confirmed', tone: 'purple' },
];

function tabFromHash(hash: string): ProductTabId {
  const id = hash.replace('#', '') as ProductTabId;
  return TAB_IDS.includes(id) ? id : 'appoint';
}

function AppointPreview() {
  return (
    <div className="public-preview" aria-hidden="true">
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
          <span className={`public-pill${row.status === 'Pending' ? ' public-pill--yellow' : ''}`}>{row.status}</span>
        </div>
      ))}
    </div>
  );
}

function MartPreview() {
  return (
    <div className="public-preview" aria-hidden="true">
      <div className="public-preview__top">
        <span className="public-preview-brand">ie orbit</span>
        <span className="public-preview-status">● Live</span>
      </div>
      <p className="public-preview-label">Storefront · Today</p>
      <div className="public-store-row">
        <div className="public-product-art">✦</div>
        <div>
          <b>Curated for your day</b>
          <small>12 products · 4 collections</small>
        </div>
        <button type="button" tabIndex={-1}>
          View shop
        </button>
      </div>
      <div className="public-store-row">
        <div className="public-product-art public-product-art--blue">◒</div>
        <div>
          <b>Order #1048</b>
          <small>Ready for dispatch</small>
        </div>
        <span className="public-pill">Paid</span>
      </div>
      <div className="public-store-row">
        <div className="public-product-art">₹</div>
        <div>
          <b>GST counter</b>
          <small>3 bills · e-invoice ready</small>
        </div>
        <span className="public-pill">Live</span>
      </div>
    </div>
  );
}

function BothPreview() {
  return (
    <div className="public-preview" aria-hidden="true">
      <div className="public-preview__top">
        <span className="public-preview-brand">ie orbit</span>
        <span className="public-preview-status">● Live</span>
      </div>
      <p className="public-preview-greeting">
        Good morning, Mira <span>✦</span>
      </p>
      <div className="public-preview-stats">
        <div>
          <small>Bookings</small>
          <b>24</b>
          <em>+8%</em>
        </div>
        <div>
          <small>Orders</small>
          <b>18</b>
          <em>+12%</em>
        </div>
      </div>
      <div className="public-booking-row" style={{ marginTop: 8 }}>
        <span className="public-avatar public-avatar--peach">NS</span>
        <div style={{ flex: 1 }}>
          <b>Nisha Shah</b>
          <small style={{ display: 'block', color: '#8291a5' }}>Haircut + take-home kit</small>
        </div>
        <span className="public-pill">Both</span>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  const location = useLocation();
  const [tab, setTab] = useState<ProductTabId>(() => tabFromHash(location.hash));
  const item = productTabs.find((entry) => entry.id === tab) ?? productTabs[0];

  useEffect(() => {
    setTab(tabFromHash(location.hash));
  }, [location.hash]);

  function selectTab(id: ProductTabId) {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Products</p>
            <h1>
              Everything your customer
              <br />
              <span className="public-gradient-text">needs to come back.</span>
            </h1>
            <p className="public-lead">
              IE Orbit connects the front door of your business to the work happening behind it. Orbit Appoint for
              bookings, Orbit Mart for retail — or both in one workspace.
            </p>
          </div>
        </div>
      </section>

      <div className="public-tabs" role="tablist" aria-label="Products">
        {productTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`public-tab${tab === entry.id ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab === entry.id}
            id={`product-tab-${entry.id}`}
            aria-controls={`product-panel-${entry.id}`}
            onClick={() => selectTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section
        className="public-product-feature"
        role="tabpanel"
        id={`product-panel-${item.id}`}
        aria-labelledby={`product-tab-${item.id}`}
      >
        <div className="public-feature-copy">
          <PublicBackLink />
          <p className="public-kicker">{item.kicker}</p>
          <h2>{item.title}</h2>
          <p>{item.body}</p>
          <ul className="public-list">
            {item.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
            <Button variant="primary">
              Create account <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </Link>
        </div>
        <div className="public-feature-visual">
          {item.id === 'appoint' ? <AppointPreview /> : null}
          {item.id === 'mart' ? <MartPreview /> : null}
          {item.id === 'both' ? <BothPreview /> : null}
        </div>
      </section>

      <div className="public-page">
        <section className="public-section" style={{ marginTop: 0 }}>
          <div className="public-section__head">
            <p className="public-kicker">Also in the workspace</p>
            <h2>Books, Grow, and the Pets pack</h2>
            <p className="public-lead">Orbit Mart includes accounting and shop helpers. Add Pets when you keep pet records.</p>
          </div>
          <div className="public-product-grid">
            {extraGroups.map((group) => {
              const Icon = group.icon;
              return (
                <article key={group.title} className={`public-card public-card--${group.tone}`}>
                  <div className="public-card-icon">
                    <Icon size={22} />
                  </div>
                  <p className="public-kicker">{group.kicker}</p>
                  <h2>{group.title}</h2>
                  <p style={{ marginBottom: 0 }}>{group.lead}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <PublicCtaBand title="Try every Pro feature for 15 days" />
    </>
  );
}
