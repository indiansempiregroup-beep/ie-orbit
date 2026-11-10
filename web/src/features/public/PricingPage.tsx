import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient, type BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { stripPlanProductPrefix } from '../../config/products';
import { isProPlan, planFeatureDisplay } from '../../config/planFeatures';
import { PlanFeatureList } from './PlanFeatureList';
import { PublicCtaBand } from './PublicCtaBand';
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

type PricingProduct = 'appointie' | 'shopie' | 'both';
type PricingRegion = 'IN' | 'INTL';

const PRODUCT_TAB_IDS: PricingProduct[] = ['appointie', 'shopie', 'both'];

function productCopy(t: TFunction, product: PricingProduct) {
  const base = `public.pricing.products.${product}`;
  return {
    kicker: t(`${base}.kicker`),
    title: t(`${base}.title`),
    lead: t(`${base}.lead`),
  };
}

const publicClient = createApiClient({ baseUrl: '/api/v1' });

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

function productFromParams(value: string | null): PricingProduct {
  if (value === 'shopie') return 'shopie';
  if (value === 'both') return 'both';
  return 'appointie';
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

function yearlyMonthsFromPlans(plans: BillingPlanCatalogItem[]) {
  const values = plans
    .map((plan) => Math.max(1, Math.min(12, Number(plan.yearly_months_charged ?? 10) || 10)))
    .filter((n) => n > 0);
  if (!values.length) return 10;
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0]! : Math.min(...unique);
}

function yearlyBillingCopy(t: TFunction, monthsCharged: number) {
  const free = Math.max(0, 12 - monthsCharged);
  const values = { months: monthsCharged, free };
  return {
    chip: t('public.pricing.yearly.chip', values),
    note:
      free > 1
        ? t('public.pricing.yearly.noteFreeMany', values)
        : free === 1
          ? t('public.pricing.yearly.noteFreeOne', values)
          : t('public.pricing.yearly.noteNoFree', values),
  };
}

function planTitle(plan: BillingPlanCatalogItem) {
  return stripPlanProductPrefix(plan.name);
}

function planKicker(plan: BillingPlanCatalogItem, t: TFunction) {
  const code = plan.plan_code.toLowerCase();
  if (code.includes('starter')) return t('public.plans.kickerStarter');
  if (code.includes('pro')) return t('public.plans.kickerPro');
  return plan.product_code;
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
  const { t } = useTranslation();
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
    <section className="public-pricing-extras">
      <div className="public-pricing-extras__intro">
        <p className="public-kicker">{t('public.pricing.extras.kicker')}</p>
        <h2>
          {t('public.pricing.extras.titleBefore')} <em>{t('public.pricing.extras.titleEm')}</em>
        </h2>
        <p>{yearlyNote}</p>
      </div>
      <div className="public-pricing-extras__grid">
        <article className="public-pricing-extras__panel">
          <p className="public-kicker">{t('public.pricing.extras.seatKicker')}</p>
          <h3>{t('public.pricing.extras.monthlyExtras')}</h3>
          <dl className="public-pricing-extras__rows">
            <div>
              <dt>
                {t('public.pricing.extras.extraStaff')}
                <span>{t('public.pricing.extras.extraStaffNote')}</span>
              </dt>
              <dd>
                {formatSaaSMoney(staffAddon, currency)}
                <span>{t('public.plans.perMonth')}</span>
              </dd>
            </div>
            <div>
              <dt>
                {t('public.pricing.extras.extraOffice')}
                <span>{t('public.pricing.extras.extraOfficeNote')}</span>
              </dt>
              <dd>
                {formatSaaSMoney(officeAddon, currency)}
                <span>{t('public.plans.perMonth')}</span>
              </dd>
            </div>
            {petsAddon ? (
              <div>
                <dt>
                  {t('public.pricing.extras.petsPack')}
                  <span>{t('public.pricing.extras.petsPackNote')}</span>
                </dt>
                <dd>
                  {formatSaaSMoney(petsAddon, currency)}
                  <span>{t('public.plans.perMonth')}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
        <article className="public-pricing-extras__panel public-pricing-extras__panel--ai">
          <p className="public-kicker">{t('public.pricing.extras.aiKicker')}</p>
          <h3>{t('public.pricing.extras.aiTitle')}</h3>
          <dl className="public-pricing-extras__rows">
            <div>
              <dt>
                {t('public.pricing.extras.freeEachDay')}
                <span>{t('public.pricing.extras.freeEachDayNote')}</span>
              </dt>
              <dd className="public-pricing-extras__dd-stack">
                <strong>{freeMessages}</strong>
                <span>{t('public.pricing.extras.questions')}</span>
                <strong>{freeConfirms}</strong>
                <span>{t('public.pricing.extras.approvals')}</span>
              </dd>
            </div>
            {usage.enabled === false ? null : (
              <>
                <div>
                  <dt>
                    {t('public.pricing.extras.extraQuestion')}
                    <span>{t('public.pricing.extras.afterFreeLimit')}</span>
                  </dt>
                  <dd>{messagePrice}</dd>
                </div>
                <div>
                  <dt>
                    {t('public.pricing.extras.extraApproval')}
                    <span>{t('public.pricing.extras.afterFreeLimit')}</span>
                  </dt>
                  <dd>{confirmPrice}</dd>
                </div>
              </>
            )}
            {wallet.enabled === false ? null : (
              <div>
                <dt>
                  {t('public.pricing.extras.walletCalls')}
                  <span>{t('public.pricing.extras.walletCallsNote')}</span>
                </dt>
                <dd>
                  {minCharge}
                  <span>{t('public.pricing.extras.minPerCall')}</span>
                </dd>
              </div>
            )}
          </dl>
        </article>
      </div>
    </section>
  );
}

function PlanGrid({
  trialDays,
  plans,
  productLabel,
  currency = 'INR',
}: {
  trialDays: number;
  plans: BillingPlanCatalogItem[];
  productLabel: string;
  currency?: 'INR' | 'USD';
}) {
  const { t } = useTranslation();
  return (
    <div className="public-pricing-grid">
      <article className="public-card public-price-card">
        <p className="public-kicker">{t('public.plans.tryFirst')}</p>
        <h2>{t('public.plans.free')}</h2>
        <p className="public-price-amount">{t('public.plans.trialDays', { days: trialDays })}</p>
        <ul className="public-list">
          <li>{t('public.plans.trialBullets.fullPro', { product: productLabel })}</li>
          <li>{t('public.plans.trialBullets.whiteLabel')}</li>
          <li>{t('public.plans.trialBullets.noCard')}</li>
          <li>{t('public.plans.trialBullets.upgrade')}</li>
        </ul>
      </article>
      {plans.map((plan) => {
        const featured = isProPlan(plan);
        return (
          <article key={plan.plan_code} className={`public-card public-price-card${featured ? ' is-featured' : ''}`}>
            {featured ? <span className="public-popular">{t('public.plans.mostPopular')}</span> : null}
            <p className="public-kicker">{planKicker(plan, t)}</p>
            <h2>{planTitle(plan)}</h2>
            <p className="public-price-amount">
              {formatSaaSMoney(plan.amount_paise, currency)}
              <span>{t('public.plans.perMonth')}</span>
            </p>
            {plan.yearly_amount_paise ? (
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                {t('public.pricing.yearly.planLine', {
                  price: formatSaaSMoney(plan.yearly_amount_paise, currency),
                  months: Math.max(1, Math.min(12, Number(plan.yearly_months_charged ?? 10) || 10)),
                })}
              </p>
            ) : null}
            <PlanFeatureList groups={planFeatureDisplay(plan, plans)} />
          </article>
        );
      })}
    </div>
  );
}

function CombinedPlanGrid({
  trialDays,
  appointPlans,
  martPlans,
  currency,
}: {
  trialDays: number;
  appointPlans: BillingPlanCatalogItem[];
  martPlans: BillingPlanCatalogItem[];
  currency: 'INR' | 'USD';
}) {
  const { t } = useTranslation();
  const appointStarter = appointPlans.find((plan) => !isProPlan(plan));
  const appointPro = appointPlans.find((plan) => isProPlan(plan));
  const martStarter = martPlans.find((plan) => !isProPlan(plan));
  const martPro = martPlans.find((plan) => isProPlan(plan));
  const fallbackStarter = currency === 'INR' ? STARTER_MONTHLY_INR * 100 : 499;
  const fallbackPro = currency === 'INR' ? PRO_MONTHLY_INR * 100 : 999;

  const tiers = [
    {
      key: 'starter',
      kicker: t('public.plans.kickerStarter'),
      name: t('public.starter'),
      featured: false,
      appoint: appointStarter,
      mart: martStarter,
      fallback: fallbackStarter * 2,
    },
    {
      key: 'pro',
      kicker: t('public.plans.kickerPro'),
      name: t('public.pro'),
      featured: true,
      appoint: appointPro,
      mart: martPro,
      fallback: fallbackPro * 2,
    },
  ].filter((tier) => tier.appoint && tier.mart);

  return (
    <div className="public-pricing-grid">
      <article className="public-card public-price-card">
        <p className="public-kicker">{t('public.plans.tryFirst')}</p>
        <h2>{t('public.plans.free')}</h2>
        <p className="public-price-amount">{t('public.plans.trialDays', { days: trialDays })}</p>
        <ul className="public-list">
          <li>{t('public.plans.combinedTrialBullets.fullPro')}</li>
          <li>{t('public.plans.combinedTrialBullets.oneApp')}</li>
          <li>{t('public.plans.combinedTrialBullets.sharedCustomers')}</li>
          <li>{t('public.plans.combinedTrialBullets.noCard')}</li>
        </ul>
      </article>
      {tiers.map((tier) => {
        const appointPaise = tier.appoint?.amount_paise ?? null;
        const martPaise = tier.mart?.amount_paise ?? null;
        const combinedPaise =
          appointPaise != null && martPaise != null ? appointPaise + martPaise : null;
        return (
          <article
            key={tier.key}
            className={`public-card public-price-card${tier.featured ? ' is-featured' : ''}`}
          >
            {tier.featured ? <span className="public-popular">{t('public.plans.mostPopular')}</span> : null}
            <p className="public-kicker">{tier.kicker}</p>
            <h2>{tier.name}</h2>
            <p className="public-price-amount">
              {formatSaaSMoney(combinedPaise ?? tier.fallback, currency)}
              <span>{t('public.plans.perMonth')}</span>
            </p>
            <p className="public-plan-features-note" style={{ marginTop: 0, marginBottom: 12 }}>
              {t('public.plans.combinedBilledNote', {
                appoint: formatSaaSMoney(appointPaise, currency),
                mart: formatSaaSMoney(martPaise, currency),
              })}
            </p>
            <div className="public-combined-plan-features">
              <div>
                <p className="public-kicker">{t('public.plans.appointName')}</p>
                <PlanFeatureList groups={planFeatureDisplay(tier.appoint!, appointPlans)} />
              </div>
              <div>
                <p className="public-kicker">{t('public.plans.martName')}</p>
                <PlanFeatureList groups={planFeatureDisplay(tier.mart!, martPlans)} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PricingFallback({
  trialDays,
  yearlyMonths = 10,
  currency = 'INR',
  product,
}: {
  trialDays: number;
  yearlyMonths?: number;
  currency?: 'INR' | 'USD';
  product: PricingProduct;
}) {
  const { t } = useTranslation();
  const yearlyCopy = yearlyBillingCopy(t, yearlyMonths);
  const starter = currency === 'INR' ? STARTER_MONTHLY_INR * 100 : 499;
  const pro = currency === 'INR' ? PRO_MONTHLY_INR * 100 : 999;
  const copy = productCopy(t, product);
  const staff = currency === 'INR' ? STAFF_ADDON_INR * 100 : 299;
  const office = currency === 'INR' ? OFFICE_ADDON_INR * 100 : 399;
  const pets = currency === 'INR' ? PETS_ADDON_INR * 100 : 699;
  const multiplier = product === 'both' ? 2 : 1;

  return (
    <section className="public-section" style={{ marginTop: 0 }}>
      <div className="public-section__head">
        <p className="public-kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <p className="public-lead">{copy.lead}</p>
      </div>
      <div className="public-pricing-grid">
        <article className="public-card public-price-card">
          <p className="public-kicker">{t('public.plans.tryFirst')}</p>
          <h2>{t('public.plans.free')}</h2>
          <p className="public-price-amount">{t('public.plans.trialDays', { days: trialDays })}</p>
          <p>{t('public.pricing.fallback.freeBlurb')}</p>
        </article>
        <article className="public-card public-price-card">
          <p className="public-kicker">{t('public.plans.kickerStarter')}</p>
          <h2>{t('public.starter')}</h2>
          <p className="public-price-amount">
            {formatSaaSMoney(starter * multiplier, currency)}
            <span>{t('public.plans.perMonth')}</span>
          </p>
          <p>
            {product === 'both'
              ? t('public.pricing.fallback.starterBlurbBoth')
              : t('public.pricing.fallback.starterBlurb')}
          </p>
        </article>
        <article className="public-card public-price-card is-featured">
          <span className="public-popular">{t('public.plans.mostPopular')}</span>
          <p className="public-kicker">{t('public.plans.kickerPro')}</p>
          <h2>{t('public.pro')}</h2>
          <p className="public-price-amount">
            {formatSaaSMoney(pro * multiplier, currency)}
            <span>{t('public.plans.perMonth')}</span>
          </p>
          <p>
            {product === 'both'
              ? t('public.pricing.fallback.proBlurbBoth')
              : t('public.pricing.fallback.proBlurb', { note: yearlyCopy.note })}
          </p>
        </article>
      </div>
      <div className="public-home-pricing-actions">
        <Link
          to={registerStartPath()}
          state={REGISTER_FRESH_START_STATE}
          onClick={() => trackEvent('generate_lead', { method: 'pricing_trial' })}
        >
          <Button variant="primary">
            {t('public.startTrial', { days: trialDays })} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </Link>
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

export function PricingPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const product = productFromParams(searchParams.get('product'));
  const productTabs = useMemo(
    () =>
      PRODUCT_TAB_IDS.map((id) => ({
        id,
        label:
          id === 'appointie'
            ? t('public.nav.appoint')
            : id === 'shopie'
              ? t('public.nav.mart')
              : t('public.nav.both'),
      })),
    [t],
  );
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
  const yearlyMonths = yearlyMonthsFromPlans([...(appointie ?? []), ...(shopie ?? [])]);
  const yearlyCopy = yearlyBillingCopy(t, yearlyMonths);
  const copy = productCopy(t, product);
  const activePlans = product === 'shopie' ? shopie : product === 'appointie' ? appointie : [];

  function patchParams(next: { product?: PricingProduct; region?: PricingRegion }) {
    const params = new URLSearchParams(searchParams);
    if (next.product) params.set('product', next.product);
    if (next.region) {
      try {
        localStorage.setItem('ieorbit.pricingRegion', next.region);
      } catch {
        /* ignore */
      }
      params.set('region', next.region === 'IN' ? 'in' : 'intl');
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <>
      <div className="public-page">
        <div className="public-pricing-toolbar">
          <div className="public-pricing-tabs" role="tablist" aria-label={t('public.products')}>
            {productTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={product === tab.id}
                className={`public-pricing-tab${product === tab.id ? ' is-active' : ''}`}
                onClick={() => patchParams({ product: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="public-pricing-region">
            <Button variant={region === 'IN' ? 'primary' : 'neutral'} onClick={() => patchParams({ region: 'IN' })}>
              {t('public.pricing.regionIn')}
            </Button>
            <Button
              variant={region === 'INTL' ? 'primary' : 'neutral'}
              onClick={() => patchParams({ region: 'INTL' })}
            >
              {t('public.pricing.regionIntl')}
            </Button>
          </div>
        </div>

        {catalogQuery.isLoading && !hasLivePlans ? (
          <PricingFallback
            trialDays={trialDays}
            yearlyMonths={yearlyMonths}
            currency={saasCurrency}
            product={product}
          />
        ) : hasLivePlans ? (
          <section className="public-section" style={{ marginTop: 0 }} id={product}>
            <div className="public-section__head">
              <p className="public-kicker">{copy.kicker}</p>
              <h2>{copy.title}</h2>
              <p className="public-lead public-lead--wide">{copy.lead}</p>
            </div>

            {product === 'both' && appointie.length > 0 && shopie.length > 0 ? (
              <CombinedPlanGrid
                trialDays={trialDays}
                appointPlans={appointie}
                martPlans={shopie}
                currency={saasCurrency}
              />
            ) : activePlans.length > 0 ? (
              <PlanGrid
                trialDays={trialDays}
                plans={activePlans}
                productLabel={copy.kicker}
                currency={saasCurrency}
              />
            ) : (
              <PricingFallback
                trialDays={trialDays}
                yearlyMonths={yearlyMonths}
                currency={saasCurrency}
                product={product}
              />
            )}

            <div className="public-home-pricing-actions">
              <Link
                to={registerStartPath()}
                state={REGISTER_FRESH_START_STATE}
                onClick={() => trackEvent('generate_lead', { method: `pricing_trial_${product}` })}
              >
                <Button variant="primary">
                  {t('public.startTrial', { days: trialDays })} <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </Link>
              <span className="public-pricing-toolbar-note">
                {yearlyCopy.chip} ·{' '}
                {region === 'IN' ? t('public.pricing.billingUpi') : t('public.pricing.billingCard')}
              </span>
            </div>

            <PricingExtrasSection
              currency={saasCurrency}
              staffAddon={staffAddon}
              officeAddon={officeAddon}
              petsAddon={petsAddon}
              yearlyNote={yearlyCopy.note}
              assistant={catalog?.assistant_usage}
              aiWallet={catalog?.ai_wallet}
            />
          </section>
        ) : (
          <PricingFallback
            trialDays={trialDays}
            yearlyMonths={yearlyMonths}
            currency={saasCurrency}
            product={product}
          />
        )}
      </div>
      <PublicCtaBand title={t('public.pricing.ctaTitle')} />
    </>
  );
}
