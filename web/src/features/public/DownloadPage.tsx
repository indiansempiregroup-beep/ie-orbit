import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';
import { OpsStoreBadges } from './OpsStoreBadges';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

export function DownloadPage() {
  const { t } = useTranslation();

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{t('public.download.eyebrow')}</p>
            <h1>{t('public.download.title')}</h1>
            <p className="public-lead public-lead--wide">{t('public.download.lead')}</p>
            <div className="public-hero-actions">
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="primary">{t('public.createAccount')}</Button>
              </Link>
              <Link to="/contact">
                <Button variant="neutral">{t('public.nav.contact')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path="/download" />
        <div className="public-product-grid">
          <article className="public-card">
            <h2>Customer app</h2>
            <p>
              Each business can offer a white-label mobile app so their customers book appointments, shop, and track
              orders under that business’s branding. Install links come from the business, not from a generic public
              store page on this site.
            </p>
          </article>
          <article className="public-card">
            <h2>{t('public.download.opsTitle')}</h2>
            <p>{t('public.download.opsBody')}</p>
            <OpsStoreBadges />
          </article>
        </div>
      </div>
      <PublicCtaBand />
    </>
  );
}
