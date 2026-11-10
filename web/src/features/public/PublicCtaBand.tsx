import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/Button';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';

export function PublicCtaBand({ title, body }: { title?: string; body?: string }) {
  const { t } = useTranslation();
  const highlights = useMemo(
    () => [t('public.cta.h1'), t('public.cta.h2'), t('public.cta.h3'), t('public.cta.h4')],
    [t],
  );

  return (
    <section className="public-cta-band" aria-label={t('public.cta.aria')}>
      <div className="public-cta-band-glow" aria-hidden="true" />
      <div className="public-cta-band-inner">
        <div className="public-cta-band-copy">
          <p className="public-kicker">{t('public.getStarted')}</p>
          <h2>{title ?? t('public.cta.title')}</h2>
          <p>{body ?? t('public.cta.body')}</p>
          <ul className="public-cta-band-highlights">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="public-hero-actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: 'cta_band' })}
            >
              <Button variant="primary">
                {t('public.createAccount')} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="neutral">{t('public.seePricing')}</Button>
            </Link>
          </div>
        </div>
        <div className="public-cta-band-visual">
          <video
            className="public-cta-band-video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/marketing/cta/brand-pocket.jpg"
            aria-hidden="true"
          >
            <source src="/marketing/cta/brand-pocket.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
    </section>
  );
}
