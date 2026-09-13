import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, PawPrint, Smartphone, Sparkles } from 'lucide-react';
import { createApiClient } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { isProPlan, planFeatureDisplay } from '../../config/planFeatures';
import { stripPlanProductPrefix } from '../../config/products';
import { PlanFeatureList } from './PlanFeatureList';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicProductShot } from './PublicProductShot';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

const publicClient = createApiClient({ baseUrl: '/api/v1' });

const TAB_IDS = ['mart', 'appoint', 'both'] as const;
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
    id: 'mart',
    label: 'Mart',
    kicker: 'Orbit Mart',
    title: 'Your products, in their pocket.',
    body: 'Create a storefront that makes your products easy to browse, buy, and remember — with POS and GST books in the same workspace. Starter is the counter plus online orders and returns; Pro unlocks Instant Delivery with Porter/Shiprocket, GST e-invoice, and Grow.',
    features: [
      'White-label customer app so shoppers buy under your brand',
      'POS, catalog, online orders, and returns on Starter',
      'Instant Delivery with Porter/Shiprocket on Pro',
      'Day-book on Starter; GST reports, e-invoice, Grow, and e-way on Pro',
    ],
  },
  {
    id: 'appoint',
    label: 'Appoint',
    kicker: 'Orbit Appoint',
    title: 'Bookings without the back-and-forth.',
    body: 'Give customers a beautiful way to discover availability, book instantly, and keep coming back. Starter is one location. Pro adds WhatsApp reminders, payments, a second office, and an ad-free app.',
    features: [
      'White-label customer app so clients book under your brand',
      'Smart availability and staff calendars',
      'Automated email reminders; WhatsApp on Pro',
      'Pro adds a second office, payments, full BI, reward points, and an ad-free customer app',
    ],
  },
  {
    id: 'both',
    label: 'Both together',
    kicker: 'Orbit Appoint + Orbit Mart',
    title: 'One brand. Every way to buy.',
    body: 'The most complete version of IE Orbit — appointments and ecommerce sharing one customer relationship.',
    features: [
      'One white-label app for book and shop',
      'Unified customer profiles',
      'Cross-sell bookings and products',
      'One 15-day trial, one workspace, UPI billing',
    ],
  },
];

const extraGroups = [
  {
    kicker: 'On every plan',
    title: 'White-label customer app',
    lead: 'Customers install your brand on iOS and Android. Starter may show Google Ads; Pro is ad-free. This is not a generic IE Orbit store listing.',
    icon: Smartphone,
    tone: 'blue' as const,
  },
  {
    kicker: 'Orbit Mart Books',
    title: 'Accounting and GST compliance',
    lead: 'Full books — purchases, GST reports, e-invoice, and e-way bill — ship on Orbit Mart Pro. Starter keeps the counter day-book plus online orders and returns. Not a separate product.',
    icon: BookOpen,
    tone: 'yellow' as const,
  },
  {
    kicker: 'Orbit Mart Grow',
    title: 'Marketing helpers for the shop',
    lead: 'GST calculators on Starter. WhatsApp share, promo posters, and Google listing helpers on Orbit Mart Pro.',
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

function tabFromHash(hash: string): ProductTabId {
  const id = hash.replace('#', '') as ProductTabId;
  return TAB_IDS.includes(id) ? id : 'mart';
}

export function FeaturesPage() {
  const location = useLocation();
  const [tab, setTab] = useState<ProductTabId>(() => tabFromHash(location.hash));
  const item = productTabs.find((entry) => entry.id === tab) ?? productTabs[0];
  const productCode = tab === 'mart' ? 'shopie' : tab === 'appoint' ? 'appointie' : null;
  const catalogQuery = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => (await publicClient.billing.publicPlans()).data,
    retry: false,
  });
  const livePlans = productCode
    ? (catalogQuery.data?.plans ?? []).filter((plan) => plan.product_code === productCode)
    : [];

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
            <p className="public-badge">White-label · Mart · Appoint</p>
            <h1>
              Your app. Their pocket.
              <br />
              <span className="public-gradient-text">Your operations behind it.</span>
            </h1>
            <p className="public-lead">
              The customer-facing app is branded to your business on every plan. Orbit Appoint runs bookings. Orbit Mart
              runs the counter. Both share one workspace.
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
        <div className={`public-feature-visual public-feature-visual--${item.id}`}>
          <PublicProductShot slot={item.id} />
        </div>
      </section>

      <div className="public-page">
        <section className="public-section" style={{ marginTop: 0 }}>
          <div className="public-section__head">
            <p className="public-kicker">Also in the workspace</p>
            <h2>White-label, books, Grow, and Pets</h2>
            <p className="public-lead">
              The customer app ships with Appoint and Mart. Books and Grow sit on Orbit Mart. Pets pack is an add-on.
            </p>
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
        {livePlans.length > 0 ? (
          <section className="public-section">
            <div className="public-section__head">
              <p className="public-kicker">Live from the catalog</p>
              <h2>What {item.kicker} includes</h2>
              <p className="public-lead">
                These lists follow the same flags platform admin edits. Starter shows every enabled function. Pro shows
                what Starter does not include, plus a short explanation for each one.
              </p>
            </div>
            <div className="public-plan-compare">
              {livePlans.map((plan) => (
                <article
                  key={plan.plan_code}
                  className={`public-card public-price-card${isProPlan(plan) ? ' is-featured' : ''}`}
                >
                  <p className="public-kicker">{isProPlan(plan) ? 'Growing teams' : 'Solo & micro'}</p>
                  <h2>{stripPlanProductPrefix(plan.name)}</h2>
                  <PlanFeatureList groups={planFeatureDisplay(plan, livePlans)} />
                </article>
              ))}
            </div>
            <p className="public-plan-features-note">
              Prices live on <Link to={`/pricing?product=${productCode ?? 'appointie'}`}>Pricing</Link>.
            </p>
          </section>
        ) : tab === 'both' ? (
          <section className="public-section">
            <div className="public-section__head">
              <p className="public-kicker">Live from the catalog</p>
              <h2>See each product’s plan functions</h2>
              <p className="public-lead">
                Appoint and Mart each have their own Starter and Pro flags. Open{' '}
                <Link to="/features#appoint">Appoint</Link> or <Link to="/features#mart">Mart</Link> to read every
                function, or compare prices on <Link to="/pricing">Pricing</Link>.
              </p>
            </div>
          </section>
        ) : null}
      </div>
      <PublicCtaBand title="Try the white-label app for 15 days" />
    </>
  );
}
