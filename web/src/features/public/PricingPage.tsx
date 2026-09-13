import { Link, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient, type BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { stripPlanProductPrefix } from '../../config/products';
import { isProPlan, planFeatureDisplay } from '../../config/planFeatures';
import { PlanFeatureList } from './PlanFeatureList';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBackLink } from './PublicBackLink';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import {
  OFFICE_ADDON_INR,
  PETS_ADDON_INR,
  PRO_MONTHLY_INR,
  STAFF_ADDON_INR,
  STARTER_MONTHLY_INR,
  TRIAL_DAYS,
} from '../../seo/config';
import { trackEvent } from '../../seo/analytics';

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'Orbit Appoint',
  shopie: 'Orbit Mart',
};

const publicClient = createApiClient({ baseUrl: '/api/v1' });

function formatInr(paise?: number | null) {
  if (paise == null) return '—';
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function formatInrAmount(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function planTitle(plan: BillingPlanCatalogItem) {
  return stripPlanProductPrefix(plan.name);
}

function planKicker(plan: BillingPlanCatalogItem) {
  const code = plan.plan_code.toLowerCase();
  if (code.includes('starter')) return 'Solo & micro';
  if (code.includes('pro')) return 'Growing teams';
  return plan.product_code;
}

export function PricingPage() {
  const [searchParams] = useSearchParams();
  const leadProduct = searchParams.get('product') === 'shopie' ? 'shopie' : 'appointie';

  const catalogQuery = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => (await publicClient.billing.publicPlans()).data,
    retry: false,
  });

  const catalog = catalogQuery.data;
  const trialDays = catalog?.trial_days || TRIAL_DAYS;
  const appointie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'appointie');
  const shopie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'shopie');
  const hasLivePlans = appointie.length > 0 || shopie.length > 0;
  const staffAddon = catalog?.addon_staff_price_paise ?? STAFF_ADDON_INR * 100;
  const officeAddon = catalog?.addon_office_price_paise ?? OFFICE_ADDON_INR * 100;
  const petsAddon = catalog?.addon_pets_price_paise ?? PETS_ADDON_INR * 100;
  const productSections = [
    {
      id: 'appointie' as const,
      plans: appointie,
      title: 'Bookings, calendar, staff, and customers',
      lead: 'Solo scheduling on Starter. WhatsApp reminders, payments, and a second office on Pro.',
    },
    {
      id: 'shopie' as const,
      plans: shopie,
      title: 'Commerce, books, and GST',
      lead: 'Counter, online orders, and returns on Starter. Instant Delivery with Porter/Shiprocket, GST books, and Grow on Pro.',
    },
  ];
  const orderedSections =
    leadProduct === 'shopie' ? [...productSections].reverse() : productSections;

  useEffect(() => {
    if (!hasLivePlans) return;
    const target = document.getElementById(leadProduct);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasLivePlans, leadProduct]);

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">White-label app on every plan</p>
            <h1>
              Plans that include <span className="public-gradient-text">your own branded app</span>
            </h1>
            <p className="public-lead">
              Pick Orbit Appoint, Orbit Mart, or both. A white-label customer app is included on Starter and Pro — not
              an add-on. Start with a {trialDays}-day free trial, then add staff and offices when you grow.
            </p>
            <div className="public-chip-row">
              <span className="public-chip">White-label customer app</span>
              <span className="public-chip">No credit card to start</span>
              <span className="public-chip">UPI billing</span>
              <span className="public-chip">Yearly is 10× monthly</span>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBackLink />
        {catalogQuery.isLoading && !hasLivePlans ? (
          <PricingFallback trialDays={trialDays} />
        ) : hasLivePlans ? (
          <>
            {orderedSections
              .filter((section) => section.plans.length > 0)
              .map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="public-section"
                  style={index === 0 ? { marginTop: 0 } : undefined}
                >
                  <div className="public-section__head">
                    <p className="public-kicker">{PRODUCT_LABELS[section.id]}</p>
                    <h2>{section.title}</h2>
                    <p className="public-lead">{section.lead}</p>
                  </div>
                  <PlanGrid
                    trialDays={trialDays}
                    plans={section.plans}
                    productLabel={PRODUCT_LABELS[section.id]}
                  />
                  <p className="public-plan-features-note">
                    Function lists follow the live plan catalog. If a platform admin turns a function on or off, this
                    page updates with it.
                  </p>
                </section>
              ))}
            <p className="public-lead" style={{ marginTop: 28 }}>
              Extra staff {formatInr(staffAddon)}/month on Starter (max 1) and Pro. Extra offices{' '}
              {formatInr(officeAddon)}/month on Pro only
              {petsAddon ? ` · Pets pack ${formatInr(petsAddon)}/month` : ''}. Yearly billing is 10× monthly (two months
              free).
            </p>
            {petsAddon ? (
              <p className="public-lead" style={{ marginTop: 8 }}>
                Pets pack is an optional Orbit Mart add-on for pet records. It is not included in the base Orbit Mart
                plan.
              </p>
            ) : null}
          </>
        ) : (
          <PricingFallback trialDays={trialDays} />
        )}
      </div>
      <PublicCtaBand title="Start with full Pro access" />
    </>
  );
}

function PricingFallback({ trialDays }: { trialDays: number }) {
  return (
    <section className="public-section" style={{ marginTop: 0 }}>
      <div className="public-section__head">
        <p className="public-kicker">Catalog defaults</p>
        <h2>Starter and Pro for each product</h2>
        <p className="public-lead">
          Live plan details load from the billing catalog when available. Default list prices below match the published
          INR catalog.
        </p>
      </div>
      <div className="public-pricing-grid">
        <article className="public-card public-price-card">
          <p className="public-kicker">Try first</p>
          <h2>Free</h2>
          <p className="public-price-amount">{trialDays} days</p>
          <p>Full Pro access during trial, then soft lock until you upgrade.</p>
          <Link
            to={registerStartPath()}
            state={REGISTER_FRESH_START_STATE}
            onClick={() => trackEvent('select_content', { content_type: 'pricing_cta', item_id: 'trial' })}
          >
            <Button variant="primary">Create account</Button>
          </Link>
        </article>
        <article className="public-card public-price-card">
          <p className="public-kicker">Solo & micro</p>
          <h2>Starter</h2>
          <p className="public-price-amount">
            {formatInrAmount(STARTER_MONTHLY_INR)}
            <span>/month</span>
          </p>
          <p>Core operations, BI Overview, one location, and a white-label customer app. Available for Orbit Appoint and Orbit Mart.</p>
        </article>
        <article className="public-card public-price-card is-featured">
          <span className="public-popular">Most popular</span>
          <p className="public-kicker">Growing teams</p>
          <h2>Pro</h2>
          <p className="public-price-amount">
            {formatInrAmount(PRO_MONTHLY_INR)}
            <span>/month</span>
          </p>
          <p>Full BI, a second office, WhatsApp or GST tools, and an ad-free white-label app. Yearly billing is 10× monthly.</p>
        </article>
      </div>
      <p className="public-lead" style={{ marginTop: 28 }}>
        Extra staff {formatInrAmount(STAFF_ADDON_INR)}/month on Starter (max 1) and Pro. Extra offices{' '}
        {formatInrAmount(OFFICE_ADDON_INR)}/month on Pro only · Pets pack {formatInrAmount(PETS_ADDON_INR)}/month.
      </p>
    </section>
  );
}

function PlanGrid({
  trialDays,
  plans,
  productLabel,
  showTrial = true,
}: {
  trialDays: number;
  plans: BillingPlanCatalogItem[];
  productLabel: string;
  showTrial?: boolean;
}) {
  return (
    <div className="public-pricing-grid">
      {showTrial ? (
        <article className="public-card public-price-card">
          <p className="public-kicker">Try first</p>
          <h2>Free</h2>
          <p className="public-price-amount">{trialDays} days</p>
          <ul className="public-list">
            <li>Full {productLabel} Pro features during trial</li>
            <li>White-label customer app under your brand</li>
            <li>No credit card required to start</li>
            <li>Upgrade any time to keep your data</li>
          </ul>
          <Link
            to={registerStartPath()}
            state={REGISTER_FRESH_START_STATE}
            onClick={() => trackEvent('select_content', { content_type: 'pricing_cta', item_id: 'trial' })}
          >
            <Button variant="primary">Create account</Button>
          </Link>
        </article>
      ) : null}
      {plans.map((plan) => {
        const featured = isProPlan(plan);
        return (
          <article key={plan.plan_code} className={`public-card public-price-card${featured ? ' is-featured' : ''}`}>
            {featured ? <span className="public-popular">Most popular</span> : null}
            <p className="public-kicker">{planKicker(plan)}</p>
            <h2>{planTitle(plan)}</h2>
            <p className="public-price-amount">
              {formatInr(plan.amount_paise)}
              <span>/month</span>
            </p>
            {plan.yearly_amount_paise ? (
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                or {formatInr(plan.yearly_amount_paise)}/year (10× monthly)
              </p>
            ) : null}
            <PlanFeatureList groups={planFeatureDisplay(plan, plans)} />
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() =>
                trackEvent('select_content', { content_type: 'pricing_cta', item_id: plan.plan_code })
              }
            >
              <Button variant="primary">Select plan</Button>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
