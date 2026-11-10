import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/Button';
import { PublicAiShowcase } from './PublicAiShowcase';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicHeroStoryVideo } from './PublicHeroStoryVideo';
import { PublicProductShot } from './PublicProductShot';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';
import { PRO_MONTHLY_INR, STARTER_MONTHLY_INR, TRIAL_DAYS } from '../../seo/config';

export function HomePage() {
  const { t } = useTranslation();

  const paths = useMemo(
    () => [
      {
        kicker: t('public.home.pathBookingsKicker'),
        title: t('public.home.pathBookingsTitle'),
        body: t('public.home.pathBookingsBody'),
        tone: 'peach' as const,
        to: '/features#appoint',
      },
      {
        kicker: t('public.home.pathShopKicker'),
        title: t('public.home.pathShopTitle'),
        body: t('public.home.pathShopBody'),
        tone: 'blue' as const,
        to: '/features#mart',
      },
      {
        kicker: t('public.home.pathBothKicker'),
        title: t('public.home.pathBothTitle'),
        body: t('public.home.pathBothBody'),
        tone: 'dark' as const,
        to: '/features#both',
      },
    ],
    [t],
  );

  const sharedBenefits = useMemo(
    () => [
      {
        title: t('public.home.benefitWhitelabelTitle'),
        body: t('public.home.benefitWhitelabelBody'),
        image: '/marketing/benefits/whitelabel.jpg',
        tone: 'peach' as const,
      },
      {
        title: t('public.home.benefitBiTitle'),
        body: t('public.home.benefitBiBody'),
        image: '/marketing/benefits/bi.jpg',
        tone: 'blue' as const,
      },
      {
        title: t('public.home.benefitUpiTitle'),
        body: t('public.home.benefitUpiBody'),
        image: '/marketing/benefits/upi.jpg',
        tone: 'teal' as const,
      },
      {
        title: t('public.home.benefitGrowTitle'),
        body: t('public.home.benefitGrowBody'),
        image: '/marketing/benefits/grow.jpg',
        tone: 'yellow' as const,
      },
    ],
    [t],
  );

  const steps = useMemo(
    () => [
      {
        title: t('public.home.step1Title'),
        body: t('public.home.step1Body'),
        gif: '/marketing/how-it-works/step-1.gif',
        tone: 'peach' as const,
      },
      {
        title: t('public.home.step2Title'),
        body: t('public.home.step2Body'),
        gif: '/marketing/how-it-works/step-2.gif',
        tone: 'blue' as const,
      },
      {
        title: t('public.home.step3Title'),
        body: t('public.home.step3Body'),
        gif: '/marketing/how-it-works/step-3.gif',
        tone: 'teal' as const,
      },
    ],
    [t],
  );

  const homeProducts = useMemo(
    () => [
      {
        name: t('public.nav.appoint'),
        kicker: t('public.home.productAppointKicker'),
        body: t('public.home.productAppointBody'),
        to: '/pricing?product=appointie',
        tone: 'peach' as const,
      },
      {
        name: t('public.nav.mart'),
        kicker: t('public.home.productMartKicker'),
        body: t('public.home.productMartBody'),
        to: '/pricing?product=shopie',
        tone: 'blue' as const,
      },
    ],
    [t],
  );

  return (
    <>
      <PublicHeroStoryVideo />

      <section className="public-hero-band">
        <div className="public-hero-inner">
          <div>
            <p className="public-eyebrow">{t('public.home.eyebrow')}</p>
            <h1>
              {t('public.home.titleBefore')}{' '}
              <span className="public-gradient-text">{t('public.home.titleEm')}</span>
            </h1>
            <p className="public-lead">{t('public.home.lead')}</p>
            <div className="public-hero-actions">
              <Link
                to={registerStartPath()}
                state={REGISTER_FRESH_START_STATE}
                onClick={() => trackEvent('generate_lead', { method: 'home_create_account' })}
              >
                <Button variant="primary">
                  {t('public.createAccount')} <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/features" className="public-signin-link">
                {t('public.seeHowItWorks')}
              </Link>
            </div>
            <p className="public-hero-note">{t('public.home.heroNote')}</p>
          </div>
          <div className="public-hero-visual">
            <div className="public-visual-tag public-visual-tag--one" aria-hidden="true">
              {t('public.home.tagOne')}
            </div>
            <PublicProductShot slot="hero" loading="eager" />
            <div className="public-visual-tag public-visual-tag--two" aria-hidden="true">
              <span className="public-mini-dot" />
              {t('public.home.tagTwo')}
            </div>
          </div>
        </div>
      </section>

      <section className="public-path-section" aria-label={t('public.home.pathsAria')}>
        <div className="public-path-inner">
          <div className="public-section-intro">
            <div>
              <p className="public-kicker">{t('public.home.pathsKicker')}</p>
              <h2>
                {t('public.home.pathsTitleBefore')} <em>{t('public.home.pathsTitleEm')}</em>
              </h2>
            </div>
            <p>{t('public.home.pathsLead')}</p>
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

      <PublicAiShowcase showCta />

      <div className="public-page">
        <section className="public-section" aria-label={t('public.home.platformAria')}>
          <div className="public-section__head">
            <p className="public-kicker">{t('public.home.platformKicker')}</p>
            <h2>{t('public.home.platformTitle')}</h2>
          </div>
          <div className="public-stats public-stats--benefits">
            {sharedBenefits.map((item) => (
              <article key={item.title} className={`public-stat public-stat--${item.tone}`}>
                <div className="public-stat-media">
                  <img src={item.image} alt="" loading="lazy" />
                </div>
                <div className="public-stat-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section" aria-label={t('public.home.howAria')}>
          <div className="public-section__head">
            <p className="public-kicker">{t('public.home.howKicker')}</p>
            <h2>{t('public.home.howTitle')}</h2>
          </div>
          <div className="public-how-grid">
            {steps.map((step, index) => (
              <article key={step.title} className={`public-stat public-stat--${step.tone} public-how-card`}>
                <div className="public-stat-media">
                  <img src={step.gif} alt="" loading="lazy" />
                </div>
                <div className="public-stat-copy">
                  <span className="public-step__index">0{index + 1}</span>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section" aria-label={t('public.home.pricingAria')}>
          <div className="public-section__head">
            <p className="public-kicker">{t('public.home.pricingKicker')}</p>
            <h2>{t('public.home.pricingTitle')}</h2>
            <p className="public-lead public-lead--wide">
              {t('public.home.pricingLead', {
                days: TRIAL_DAYS,
                starter: STARTER_MONTHLY_INR,
                pro: PRO_MONTHLY_INR,
              })}
            </p>
          </div>
          <div className="public-home-pricing">
            {homeProducts.map((product) => (
              <article key={product.name} className={`public-home-price-card public-home-price-card--${product.tone}`}>
                <p className="public-kicker">{product.kicker}</p>
                <h3>{product.name}</h3>
                <p>{product.body}</p>
                <div className="public-home-price-tiers">
                  <div>
                    <strong>{t('public.starter')}</strong>
                    <span>{t('public.perMonth', { amount: STARTER_MONTHLY_INR })}</span>
                  </div>
                  <div>
                    <strong>{t('public.pro')}</strong>
                    <span>{t('public.perMonth', { amount: PRO_MONTHLY_INR })}</span>
                  </div>
                </div>
                <Link to={product.to}>
                  <Button variant="neutral">
                    {t('public.seePlans', { name: product.name })} <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </Link>
              </article>
            ))}
          </div>
          <div className="public-home-pricing-actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: 'home_pricing_trial' })}
            >
              <Button variant="primary">{t('public.startTrial', { days: TRIAL_DAYS })}</Button>
            </Link>
          </div>
        </section>
      </div>

      <PublicCtaBand />
    </>
  );
}
