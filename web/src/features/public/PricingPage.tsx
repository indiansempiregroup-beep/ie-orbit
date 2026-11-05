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
  AI_WALLET_MIN_INR,
  AI_WALLET_MIN_USD,
  ASSISTANT_CONFIRM_INR,
  ASSISTANT_CONFIRM_USD,
  ASSISTANT_DAILY_FREE_CONFIRMS,
  ASSISTANT_DAILY_FREE_MESSAGES,
  ASSISTANT_MESSAGE_INR,
  ASSISTANT_MESSAGE_USD,
  OFFICE_ADDON_INR,
  PETS_ADDON_INR,
  PRO_MONTHLY_INR,
  STAFF_ADDON_INR,
  STARTER_MONTHLY_INR,
  TRIAL_DAYS,
} from '../../seo/config';
import { trackEvent } from '../../seo/analytics';

type PublicAssistantUsage = {
  enabled?: boolean;
  message_price_paise?: number;
  confirm_price_paise?: number;
  daily_free_messages?: number;
  daily_free_confirms?: number;
};

type PublicAiWallet = {
  enabled?: boolean;
  min_charge_paise?: number;
};

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'Orbit Appoint',
  shopie: 'Orbit Mart',
};

const publicClient = createApiClient({ baseUrl: '/api/v1' });

type PricingRegion = 'IN' | 'INTL';

function guessPricingRegion(): PricingRegion {
  try {
    const stored = localStorage.getItem('ieorbit.pricingRegion');
    if (stored === 'IN' || stored === 'INTL') return stored;
  } catch {
    /* ignore */
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (locale.toLowerCase().includes('-in') || tz === 'Asia/Kolkata') return 'IN';
  } catch {
    /* ignore */
  }
  return 'INTL';
}

function formatSaaSMoney(minor?: number | null, currency: 'INR' | 'USD' = 'INR') {
  if (minor == null) return '—';
  const amount = Math.round(minor) / 100;
  const needsCents = Math.abs(amount - Math.round(amount)) > 0.0001;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: needsCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency === 'INR' ? `₹${amount}` : `$${amount}`;
  }
}

function fallbackAssistantUsage(currency: 'INR' | 'USD'): PublicAssistantUsage {
  return {
    enabled: true,
    message_price_paise: Math.round((currency === 'INR' ? ASSISTANT_MESSAGE_INR : ASSISTANT_MESSAGE_USD) * 100),
    confirm_price_paise: Math.round((currency === 'INR' ? ASSISTANT_CONFIRM_INR : ASSISTANT_CONFIRM_USD) * 100),
    daily_free_messages: ASSISTANT_DAILY_FREE_MESSAGES,
    daily_free_confirms: ASSISTANT_DAILY_FREE_CONFIRMS,
  };
}

function fallbackAiWallet(currency: 'INR' | 'USD'): PublicAiWallet {
  return {
    enabled: true,
    min_charge_paise: Math.round((currency === 'INR' ? AI_WALLET_MIN_INR : AI_WALLET_MIN_USD) * 100),
  };
}

function PricingExtrasSection({
  currency,
  staffAddon,
  officeAddon,
  petsAddon,
  yearlyNote,
  assistant,
  aiWallet,
}: {
  currency: 'INR' | 'USD';
  staffAddon: number;
  officeAddon: number;
  petsAddon?: number | null;
  yearlyNote: string;
  assistant?: PublicAssistantUsage | null;
  aiWallet?: PublicAiWallet | null;
}) {
  const usage = assistant ?? fallbackAssistantUsage(currency);
  const wallet = aiWallet ?? fallbackAiWallet(currency);
  const freeMessages = Math.max(1, Number(usage.daily_free_messages) || ASSISTANT_DAILY_FREE_MESSAGES);
  const freeConfirms = Math.max(1, Number(usage.daily_free_confirms) || ASSISTANT_DAILY_FREE_CONFIRMS);
  const messagePrice = formatSaaSMoney(
    usage.message_price_paise ?? fallbackAssistantUsage(currency).message_price_paise,
    currency,
  );
  const confirmPrice = formatSaaSMoney(
    usage.confirm_price_paise ?? fallbackAssistantUsage(currency).confirm_price_paise,
    currency,
  );
  const minCharge = formatSaaSMoney(
    wallet.min_charge_paise ?? fallbackAiWallet(currency).min_charge_paise,
    currency,
  );

  return (
    <section className="public-pricing-extras" aria-labelledby="pricing-extras-title">
      <div className="public-pricing-extras__intro">
        <p className="public-kicker">Beyond the base plan</p>
        <h2 id="pricing-extras-title">
          Add seats when you grow. <em>Pay for AI as you use it.</em>
        </h2>
        <p>{yearlyNote}</p>
      </div>

      <div className="public-pricing-extras__grid">
        <article className="public-pricing-extras__panel">
          <p className="public-kicker">Seat & pack add-ons</p>
          <h3>Monthly extras</h3>
          <p className="public-pricing-extras__lead">
            Add capacity on top of Starter or Pro. Charged with your subscription.
          </p>
          <dl className="public-pricing-extras__rows">
            <div>
              <dt>
                Extra staff
                <span>Starter (max 1) and Pro</span>
              </dt>
              <dd>
                {formatSaaSMoney(staffAddon, currency)}
                <span>/month</span>
              </dd>
            </div>
            <div>
              <dt>
                Extra office
                <span>Pro only</span>
              </dt>
              <dd>
                {formatSaaSMoney(officeAddon, currency)}
                <span>/month</span>
              </dd>
            </div>
            {petsAddon ? (
              <div>
                <dt>
                  Pets pack
                  <span>Optional Orbit Mart add-on for pet records</span>
                </dt>
                <dd>
                  {formatSaaSMoney(petsAddon, currency)}
                  <span>/month</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className="public-pricing-extras__panel public-pricing-extras__panel--ai">
          <p className="public-kicker">AI usage</p>
          <h3>Prepaid wallets on Pro</h3>
          <p className="public-pricing-extras__lead">
            Ask the Assistant about bookings, orders, stock, or customers in plain language. A{' '}
            <strong>message</strong> is one question you send. A <strong>confirm</strong> is when you approve a change
            it proposes — nothing updates until you say yes. Free daily allowance first, then top up only if you need
            more.
          </p>
          <dl className="public-pricing-extras__rows">
            <div>
              <dt>
                Free each day
                <span>Included before any wallet charge</span>
              </dt>
              <dd className="public-pricing-extras__dd-stack">
                <strong>{freeMessages}</strong>
                <span>questions</span>
                <strong>{freeConfirms}</strong>
                <span>approvals</span>
              </dd>
            </div>
            {usage.enabled === false ? null : (
              <>
                <div>
                  <dt>
                    Extra question
                    <span>One Assistant message after the free daily limit</span>
                  </dt>
                  <dd>{messagePrice}</dd>
                </div>
                <div>
                  <dt>
                    Extra approval
                    <span>One confirm after the free daily limit</span>
                  </dt>
                  <dd>{confirmPrice}</dd>
                </div>
              </>
            )}
            {wallet.enabled === false ? null : (
              <div>
                <dt>
                  AI wallet calls
                  <span>Pack-photo fill, invoice scans, automation drafts</span>
                </dt>
                <dd>
                  {minCharge}
                  <span>min / call</span>
                </dd>
              </div>
            )}
          </dl>
        </article>
      </div>
    </section>
  );
}

function yearlyMonthsFromPlans(plans: BillingPlanCatalogItem[]) {
  const values = plans
    .map((plan) => Math.max(1, Math.min(12, Number(plan.yearly_months_charged ?? 10) || 10)))
    .filter((n) => n > 0);
  if (!values.length) return 10;
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0]! : Math.min(...unique);
}

function yearlyBillingCopy(monthsCharged: number) {
  const free = Math.max(0, 12 - monthsCharged);
  return {
    chip: `Yearly is ${monthsCharged}× monthly`,
    note:
      free > 0
        ? `Yearly billing is ${monthsCharged}× monthly (${free} month${free === 1 ? '' : 's'} free).`
        : `Yearly billing is ${monthsCharged}× monthly.`,
    planSuffix: `${monthsCharged}× monthly`,
  };
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
  const [searchParams, setSearchParams] = useSearchParams();
  const leadProduct = searchParams.get('product') === 'shopie' ? 'shopie' : 'appointie';
  const regionParam = (searchParams.get('region') || '').toLowerCase();
  const region: PricingRegion =
    regionParam === 'intl' || regionParam === 'in'
      ? regionParam === 'intl'
        ? 'INTL'
        : 'IN'
      : guessPricingRegion();
  const saasCurrency: 'INR' | 'USD' = region === 'IN' ? 'INR' : 'USD';

  const catalogQuery = useQuery({
    queryKey: ['public', 'plans', saasCurrency],
    queryFn: async () => (await publicClient.billing.publicPlans({ currency: saasCurrency })).data,
    retry: false,
  });

  const catalog = catalogQuery.data;
  const trialDays = catalog?.trial_days || TRIAL_DAYS;
  const appointie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'appointie');
  const shopie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'shopie');
  const hasLivePlans = appointie.length > 0 || shopie.length > 0;
  const staffAddon = catalog?.addon_staff_price_paise ?? (saasCurrency === 'INR' ? STAFF_ADDON_INR * 100 : 299);
  const officeAddon = catalog?.addon_office_price_paise ?? (saasCurrency === 'INR' ? OFFICE_ADDON_INR * 100 : 399);
  const petsAddon = catalog?.addon_pets_price_paise ?? (saasCurrency === 'INR' ? PETS_ADDON_INR * 100 : 699);

  function setRegion(next: PricingRegion) {
    try {
      localStorage.setItem('ieorbit.pricingRegion', next);
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams(searchParams);
    params.set('region', next === 'IN' ? 'in' : 'intl');
    setSearchParams(params, { replace: true });
  }
  const yearlyMonths = yearlyMonthsFromPlans([...(appointie ?? []), ...(shopie ?? [])]);
  const yearlyCopy = yearlyBillingCopy(yearlyMonths);
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
              <span className="public-chip">AI assistant, automations, and invoice extraction on Pro</span>
              <span className="public-chip">No credit card to start</span>
              <span className="public-chip">{region === 'IN' ? 'UPI billing' : 'Card billing (USD)'}</span>
              <span className="public-chip">{yearlyCopy.chip}</span>
            </div>
            <div className="public-chip-row" style={{ marginTop: 16 }}>
              <Button
                variant={region === 'IN' ? 'primary' : 'neutral'}
                onClick={() => setRegion('IN')}
              >
                India (₹)
              </Button>
              <Button
                variant={region === 'INTL' ? 'primary' : 'neutral'}
                onClick={() => setRegion('INTL')}
              >
                International ($)
              </Button>
            </div>
            <p className="public-lead" style={{ marginTop: 12, fontSize: 14 }}>
              Subscription is billed in {saasCurrency === 'INR' ? 'INR for India' : 'USD outside India'}. Your shop
              currency (for customers) is chosen separately after signup.
            </p>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBackLink />
        {catalogQuery.isLoading && !hasLivePlans ? (
          <PricingFallback trialDays={trialDays} yearlyMonths={yearlyMonths} currency={saasCurrency} />
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
                    currency={saasCurrency}
                  />
                </section>
              ))}
            <PricingExtrasSection
              currency={saasCurrency}
              staffAddon={staffAddon}
              officeAddon={officeAddon}
              petsAddon={petsAddon}
              yearlyNote={yearlyCopy.note}
              assistant={catalog?.assistant_usage}
              aiWallet={catalog?.ai_wallet}
            />
          </>
        ) : (
          <PricingFallback trialDays={trialDays} yearlyMonths={yearlyMonths} currency={saasCurrency} />
        )}
      </div>
      <PublicCtaBand title="Start with full Pro access" />
    </>
  );
}

function PricingFallback({
  trialDays,
  yearlyMonths = 10,
  currency = 'INR',
}: {
  trialDays: number;
  yearlyMonths?: number;
  currency?: 'INR' | 'USD';
}) {
  const yearlyCopy = yearlyBillingCopy(yearlyMonths);
  const starter = currency === 'INR' ? STARTER_MONTHLY_INR * 100 : 499;
  const pro = currency === 'INR' ? PRO_MONTHLY_INR * 100 : 999;
  const staff = currency === 'INR' ? STAFF_ADDON_INR * 100 : 299;
  const office = currency === 'INR' ? OFFICE_ADDON_INR * 100 : 399;
  const pets = currency === 'INR' ? PETS_ADDON_INR * 100 : 699;
  return (
    <section className="public-section" style={{ marginTop: 0 }}>
      <div className="public-section__head">
        <p className="public-kicker">Catalog defaults</p>
        <h2>Starter and Pro for each product</h2>
        <p className="public-lead">
          Live plan details load from the billing catalog when available. Default list prices below match the published{' '}
          {currency} catalog.
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
            {formatSaaSMoney(starter, currency)}
            <span>/month</span>
          </p>
          <p>Core operations, BI Overview, one location, and a white-label customer app. Available for Orbit Appoint and Orbit Mart.</p>
        </article>
        <article className="public-card public-price-card is-featured">
          <span className="public-popular">Most popular</span>
          <p className="public-kicker">Growing teams</p>
          <h2>Pro</h2>
          <p className="public-price-amount">
            {formatSaaSMoney(pro, currency)}
            <span>/month</span>
          </p>
          <p>Full BI, a second office, WhatsApp or GST tools, and an ad-free white-label app. {yearlyCopy.note}</p>
        </article>
      </div>
      <PricingExtrasSection
        currency={currency}
        staffAddon={staff}
        officeAddon={office}
        petsAddon={pets}
        yearlyNote={yearlyCopy.note}
      />
    </section>
  );
}

function PlanGrid({
  trialDays,
  plans,
  productLabel,
  showTrial = true,
  currency = 'INR',
}: {
  trialDays: number;
  plans: BillingPlanCatalogItem[];
  productLabel: string;
  showTrial?: boolean;
  currency?: 'INR' | 'USD';
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
              {formatSaaSMoney(plan.amount_paise, currency)}
              <span>/month</span>
            </p>
            {plan.yearly_amount_paise ? (
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                or {formatSaaSMoney(plan.yearly_amount_paise, currency)}/year (
                {yearlyBillingCopy(Math.max(1, Math.min(12, Number(plan.yearly_months_charged ?? 10) || 10))).planSuffix})
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
