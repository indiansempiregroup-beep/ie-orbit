import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createApiClient, type BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { stripPlanProductPrefix } from '../../config/products';
import { PublicCtaBand } from './PublicCtaBand';
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

function isProPlan(plan: BillingPlanCatalogItem) {
  return plan.plan_code.toLowerCase().includes('pro');
}

function planFeatures(plan: BillingPlanCatalogItem): string[] {
  const staff = plan.max_staff ?? 1;
  const offices = plan.max_branches ?? 1;
  const isShopie = plan.product_code === 'shopie';
  const bullets = [
    isShopie ? `${staff} staff` : `${staff} bookable staff`,
    `${offices} office${offices === 1 ? '' : 's'} with address + Google Maps`,
  ];
  if (isShopie) {
    bullets.push('POS, catalog, online orders, and returns');
    bullets.push('Books: sales, purchases, cash, GST reports, e-invoice, e-way bill');
    bullets.push('Grow: WhatsApp, promo posters, Google listing helpers');
  }
  const bi = plan.bi_features ?? [];
  if (bi.length > 1) {
    bullets.push('Full BI: Growth, Revenue, Forecast, Reports');
  } else {
    bullets.push('BI Overview only');
  }
  if ((plan.features ?? []).includes('reward_points')) {
    bullets.push('Reward points for customers (earn & redeem)');
  }
  if ((plan.features ?? []).includes('ad_free')) {
    bullets.push('Ad-free operations and customer apps');
  } else {
    bullets.push('Supported by Google Ads in the mobile apps');
  }
  if ((plan.features ?? []).includes('razorpay_payments')) {
    bullets.push('Connect your Razorpay account for customer payments');
  }
  bullets.push('Self-serve staff and office add-ons');
  return bullets;
}

export function PricingPage() {
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

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Transparent INR pricing</p>
            <h1>
              Simple, scalable <span className="public-gradient-text">pricing</span>
            </h1>
            <p className="public-lead">
              Pick Orbit Appoint, Orbit Mart, or both in one workspace. Start with a {trialDays}-day free trial, then add
              staff and offices when you grow.
            </p>
            <div className="public-chip-row">
              <span className="public-chip">No credit card to start</span>
              <span className="public-chip">UPI billing</span>
              <span className="public-chip">Yearly is 10× monthly</span>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        {catalogQuery.isLoading && !hasLivePlans ? (
          <PricingFallback trialDays={trialDays} />
        ) : hasLivePlans ? (
          <>
            {appointie.length > 0 ? (
              <section className="public-section" style={{ marginTop: 0 }}>
                <div className="public-section__head">
                  <p className="public-kicker">{PRODUCT_LABELS.appointie}</p>
                  <h2>Bookings, calendar, staff, and customers</h2>
                  <p className="public-lead">For salons, clinics, trainers, and other appointment-based teams.</p>
                </div>
                <PlanGrid trialDays={trialDays} plans={appointie} productLabel={PRODUCT_LABELS.appointie} />
              </section>
            ) : null}
            {shopie.length > 0 ? (
              <section className="public-section">
                <div className="public-section__head">
                  <p className="public-kicker">{PRODUCT_LABELS.shopie}</p>
                  <h2>Commerce, books, and GST</h2>
                  <p className="public-lead">Counter, catalog, and GST books on the same workspace.</p>
                </div>
                <PlanGrid trialDays={trialDays} plans={shopie} productLabel={PRODUCT_LABELS.shopie} />
              </section>
            ) : null}
            <p className="public-lead" style={{ marginTop: 28 }}>
              Extra staff {formatInr(staffAddon)}/month · extra office {formatInr(officeAddon)}/month
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
          <p>Core operations with BI Overview. Available for Orbit Appoint and Orbit Mart.</p>
        </article>
        <article className="public-card public-price-card is-featured">
          <span className="public-popular">Most popular</span>
          <p className="public-kicker">Growing teams</p>
          <h2>Pro</h2>
          <p className="public-price-amount">
            {formatInrAmount(PRO_MONTHLY_INR)}
            <span>/month</span>
          </p>
          <p>Full BI suite and higher limits. Yearly billing is 10× monthly.</p>
        </article>
      </div>
      <p className="public-lead" style={{ marginTop: 28 }}>
        Extra staff {formatInrAmount(STAFF_ADDON_INR)}/month · extra office {formatInrAmount(OFFICE_ADDON_INR)}/month ·
        Pets pack {formatInrAmount(PETS_ADDON_INR)}/month.
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
          <p>Full {productLabel} Pro access, then soft lock until you upgrade.</p>
          <ul className="public-list">
            <li>Full Pro features during trial</li>
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
            <p>{plan.description}</p>
            <ul className="public-list">
              {planFeatures(plan).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() =>
                trackEvent('select_content', { content_type: 'pricing_cta', item_id: plan.plan_code })
              }
            >
              <Button variant={featured ? 'primary' : 'neutral'}>Choose {planTitle(plan)}</Button>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
