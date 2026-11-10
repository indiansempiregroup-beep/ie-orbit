import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight } from 'lucide-react';
import { createApiClient, type BillingPlanCatalogItem } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { combinedPlanFeatureSections, isProPlan, planFeatureDisplay } from '../../config/planFeatures';
import { stripPlanProductPrefix } from '../../config/products';
import { PlanFeatureList } from './PlanFeatureList';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicProductShot } from './PublicProductShot';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { PRO_MONTHLY_INR, STARTER_MONTHLY_INR, TRIAL_DAYS } from '../../seo/config';
import { trackEvent } from '../../seo/analytics';

const publicClient = createApiClient({ baseUrl: '/api/v1' });

function formatInr(paise?: number | null) {
  if (paise == null) return null;
  const amount = Math.round(paise) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

function planKicker(plan: BillingPlanCatalogItem, t: TFunction) {
  const code = plan.plan_code.toLowerCase();
  if (code.includes('starter')) return t('public.plans.kickerStarter');
  if (code.includes('pro')) return t('public.plans.kickerPro');
  return plan.product_code;
}

const PRODUCT_IDS = ['appoint', 'mart', 'both'] as const;
type ProductId = (typeof PRODUCT_IDS)[number];

type ProductContent = {
  id: ProductId;
  kicker: string;
  title: string;
  benefits: string[];
  pricingTitle: string;
  pricingLead: string;
  pricingProduct: 'appointie' | 'shopie' | 'both';
  packages: Array<{
    name: string;
    kicker: string;
    price: string;
    features: string[];
    featured?: boolean;
  }>;
};

const BENEFIT_COUNT: Record<ProductId, number> = { appoint: 10, mart: 10, both: 12 };
const STARTER_FEATURE_COUNT: Record<ProductId, number> = { appoint: 5, mart: 5, both: 5 };
const PRO_FEATURE_COUNT: Record<ProductId, number> = { appoint: 6, mart: 6, both: 5 };
const PRICING_PRODUCT: Record<ProductId, ProductContent['pricingProduct']> = {
  appoint: 'appointie',
  mart: 'shopie',
  both: 'both',
};

function buildProducts(t: TFunction): ProductContent[] {
  const starterPrice = `₹${STARTER_MONTHLY_INR}`;
  const proPrice = `₹${PRO_MONTHLY_INR}`;

  return PRODUCT_IDS.map((id) => {
    const base = `public.features.${id}`;
    const list = (path: string, count: number, values?: Record<string, unknown>) =>
      Array.from({ length: count }, (_, i) => t(`${base}.${path}.f${i + 1}`, values) as string);
    const isBoth = id === 'both';
    const packageValues = isBoth ? { price: starterPrice } : undefined;
    const proPackageValues = isBoth ? { price: proPrice } : undefined;
    const priceMultiplier = isBoth ? 2 : 1;

    return {
      id,
      kicker: t(`${base}.kicker`),
      title: t(`${base}.title`),
      benefits: Array.from({ length: BENEFIT_COUNT[id] }, (_, i) =>
        t(`${base}.benefits.b${i + 1}.title`) as string,
      ),
      pricingTitle: t(`${base}.pricingTitle`),
      pricingLead: isBoth
        ? ''
        : t(`${base}.pricingLead`, { days: TRIAL_DAYS, starter: starterPrice, pro: proPrice }),
      pricingProduct: PRICING_PRODUCT[id],
      packages: [
        {
          name: t('public.starter'),
          kicker: t('public.plans.kickerStarter'),
          price: `₹${STARTER_MONTHLY_INR * priceMultiplier}`,
          features: list('starter', STARTER_FEATURE_COUNT[id], packageValues),
        },
        {
          name: t('public.pro'),
          kicker: t('public.plans.kickerPro'),
          price: `₹${PRO_MONTHLY_INR * priceMultiplier}`,
          features: list('pro', PRO_FEATURE_COUNT[id], proPackageValues),
          featured: true,
        },
      ],
    };
  });
}

function productFromHash(hash: string): ProductId {
  const id = hash.replace('#', '') as ProductId;
  return PRODUCT_IDS.includes(id) ? id : 'mart';
}

function ProductPlanCards({
  plans,
  productLabel,
}: {
  plans: BillingPlanCatalogItem[];
  productLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="public-pricing-grid">
      <article className="public-card public-price-card">
        <p className="public-kicker">{t('public.plans.tryFirst')}</p>
        <h2>{t('public.plans.free')}</h2>
        <p className="public-price-amount">{t('public.plans.trialDays', { days: TRIAL_DAYS })}</p>
        <ul className="public-list">
          <li>{t('public.plans.trialBullets.fullPro', { product: productLabel })}</li>
          <li>{t('public.plans.trialBullets.whiteLabel')}</li>
          <li>{t('public.plans.trialBullets.noCard')}</li>
          <li>{t('public.plans.trialBullets.upgrade')}</li>
        </ul>
      </article>
      {plans.map((plan) => {
        const featured = isProPlan(plan);
        const price = formatInr(plan.amount_paise) ?? (featured ? `₹${PRO_MONTHLY_INR}` : `₹${STARTER_MONTHLY_INR}`);
        return (
          <article key={plan.plan_code} className={`public-card public-price-card${featured ? ' is-featured' : ''}`}>
            {featured ? <span className="public-popular">{t('public.plans.mostPopular')}</span> : null}
            <p className="public-kicker">{planKicker(plan, t)}</p>
            <h2>{stripPlanProductPrefix(plan.name)}</h2>
            <p className="public-price-amount">
              {price}
              <span>{t('public.plans.perMonth')}</span>
            </p>
            <PlanFeatureList groups={planFeatureDisplay(plan, plans)} />
          </article>
        );
      })}
    </div>
  );
}

function FallbackPlanCards({
  packages,
}: {
  packages: ProductContent['packages'];
}) {
  const { t } = useTranslation();
  return (
    <div className="public-pricing-grid">
      {packages.map((plan) => (
        <article
          key={plan.name}
          className={`public-card public-price-card${plan.featured ? ' is-featured' : ''}`}
        >
          {plan.featured ? <span className="public-popular">{t('public.plans.mostPopular')}</span> : null}
          <p className="public-kicker">{plan.kicker}</p>
          <h2>{plan.name}</h2>
          <p className="public-price-amount">
            {plan.price}
            <span>{t('public.plans.perMonth')}</span>
          </p>
          <ul className="public-list">
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function CombinedPlanCards({
  appointPlans,
  martPlans,
}: {
  appointPlans: BillingPlanCatalogItem[];
  martPlans: BillingPlanCatalogItem[];
}) {
  const { t } = useTranslation();
  const appointStarter = appointPlans.find((plan) => !isProPlan(plan));
  const appointPro = appointPlans.find((plan) => isProPlan(plan));
  const martStarter = martPlans.find((plan) => !isProPlan(plan));
  const martPro = martPlans.find((plan) => isProPlan(plan));

  const tiers = [
    {
      key: 'starter',
      kicker: t('public.plans.kickerStarter'),
      name: t('public.starter'),
      featured: false,
      appoint: appointStarter,
      mart: martStarter,
      fallbackPrice: STARTER_MONTHLY_INR * 2,
    },
    {
      key: 'pro',
      kicker: t('public.plans.kickerPro'),
      name: t('public.pro'),
      featured: true,
      appoint: appointPro,
      mart: martPro,
      fallbackPrice: PRO_MONTHLY_INR * 2,
    },
  ].filter((tier) => tier.appoint && tier.mart);

  return (
    <div className="public-pricing-grid">
      <article className="public-card public-price-card">
        <p className="public-kicker">{t('public.plans.tryFirst')}</p>
        <h2>{t('public.plans.free')}</h2>
        <p className="public-price-amount">{t('public.plans.trialDays', { days: TRIAL_DAYS })}</p>
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
        const combined = formatInr(combinedPaise) ?? `₹${tier.fallbackPrice}`;
        const sections = combinedPlanFeatureSections(
          tier.appoint!,
          appointPlans,
          tier.mart!,
          martPlans,
        );
        return (
          <article
            key={tier.key}
            className={`public-card public-price-card${tier.featured ? ' is-featured' : ''}`}
          >
            {tier.featured ? <span className="public-popular">{t('public.plans.mostPopular')}</span> : null}
            <p className="public-kicker">{tier.kicker}</p>
            <h2>{tier.name}</h2>
            <p className="public-price-amount">
              {combined}
              <span>{t('public.plans.perMonth')}</span>
            </p>
            <p className="public-plan-features-note" style={{ marginTop: 0, marginBottom: 12 }}>
              {t('public.plans.combinedBilledNote', {
                appoint: formatInr(appointPaise) ?? `₹${STARTER_MONTHLY_INR}`,
                mart: formatInr(martPaise) ?? `₹${STARTER_MONTHLY_INR}`,
              })}
            </p>
            <div className="public-combined-plan-features">
              <div>
                <h3 className="public-combined-plan-features__title">{t('public.plans.sharedName')}</h3>
                <PlanFeatureList groups={sections.shared} />
              </div>
              <div>
                <h3 className="public-combined-plan-features__title">{t('public.plans.appointName')}</h3>
                <PlanFeatureList groups={sections.appoint} />
              </div>
              <div>
                <h3 className="public-combined-plan-features__title">{t('public.plans.martName')}</h3>
                <PlanFeatureList groups={sections.mart} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function FeaturesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const productId = productFromHash(location.hash);
  const products = useMemo(() => buildProducts(t), [t]);
  const item = products.find((entry) => entry.id === productId) ?? products[0]!;

  const catalogQuery = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => (await publicClient.billing.publicPlans()).data,
    retry: false,
  });
  const appointPlans = (catalogQuery.data?.plans ?? []).filter((plan) => plan.product_code === 'appointie');
  const martPlans = (catalogQuery.data?.plans ?? []).filter((plan) => plan.product_code === 'shopie');
  const livePlans =
    item.pricingProduct === 'appointie'
      ? appointPlans
      : item.pricingProduct === 'shopie'
        ? martPlans
        : [];

  return (
    <>
      <section className="public-product-feature public-product-feature--page">
        <div className="public-feature-copy">
          <p className="public-kicker">{item.kicker}</p>
          <h1>{item.title}</h1>
          <ul className="public-list">
            {item.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
            <Button variant="primary">
              {t('public.features.createAccount')} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </Link>
        </div>
        <div className="public-feature-visual">
          <PublicProductShot slot="workspace" rotate={false} />
        </div>
      </section>

      <section
        className="public-home-band public-home-band--pricing public-features-pricing"
        aria-label={t('public.features.pricingAria')}
      >
        <div className="public-path-inner">
          <div className="public-section__head">
            <p className="public-kicker">{t('public.features.pricingKicker')}</p>
            <h2>{item.pricingTitle}</h2>
            {item.pricingLead ? (
              <p className="public-lead public-lead--wide">{item.pricingLead}</p>
            ) : null}
          </div>

          {item.pricingProduct === 'both' ? (
            appointPlans.length > 0 && martPlans.length > 0 ? (
              <CombinedPlanCards appointPlans={appointPlans} martPlans={martPlans} />
            ) : (
              <FallbackPlanCards packages={item.packages} />
            )
          ) : livePlans.length > 0 ? (
            <ProductPlanCards plans={livePlans} productLabel={item.kicker} />
          ) : (
            <FallbackPlanCards packages={item.packages} />
          )}

          <div className="public-home-pricing-actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: `features_pricing_${item.id}` })}
            >
              <Button variant="primary">{t('public.startTrial', { days: TRIAL_DAYS })}</Button>
            </Link>
          </div>
        </div>
      </section>
      <PublicCtaBand title={t('public.features.ctaTitle', { days: TRIAL_DAYS })} />
    </>
  );
}
