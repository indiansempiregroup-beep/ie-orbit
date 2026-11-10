import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';
import { asRecordArray, asString, objectReader } from './translate';

const INTEGRATION_IMAGES = [
  '/marketing/integrations/upi.jpg',
  '/marketing/integrations/razorpay.jpg',
  '/marketing/integrations/cashfree.jpg',
  '/marketing/integrations/google-signin.jpg',
  '/marketing/integrations/maps.jpg',
  '/marketing/integrations/calendar.jpg',
  '/marketing/integrations/analytics.jpg',
  '/marketing/integrations/ads.jpg',
  '/marketing/integrations/fcm.jpg',
  '/marketing/integrations/whatsapp.jpg',
  '/marketing/integrations/delivery.jpg',
  '/marketing/integrations/gst.jpg',
] as const;

const cardTones = ['peach', 'blue', 'yellow', 'purple'] as const;

export function IntegrationsPage() {
  const { t } = useTranslation();
  const integrations = useMemo(
    () =>
      asRecordArray(objectReader(t)('public.integrations.items')).map((item, index) => ({
        title: asString(item.title),
        body: asString(item.body),
        image: INTEGRATION_IMAGES[index] ?? INTEGRATION_IMAGES[0],
      })),
    [t],
  );

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{t('public.integrations.eyebrow')}</p>
            <h1>{t('public.integrations.title')}</h1>
            <p className="public-lead public-lead--wide">{t('public.integrations.lead')}</p>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path="/integrations" />
        <div className="public-product-grid">
          {integrations.map((item, index) => (
            <article
              key={item.title}
              className={`public-card public-card--media public-card--${cardTones[index % cardTones.length]}`}
            >
              <div className="public-card-media">
                <img src={item.image} alt="" loading="lazy" />
              </div>
              <div className="public-card-body">
                <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>{item.title}</h2>
                <p style={{ marginBottom: 0 }}>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 24, color: 'var(--pub-muted)' }}>
          <Trans
            i18nKey="public.integrations.footer"
            components={{ privacy: <Link to="/privacy" />, cookies: <Link to="/cookies" /> }}
          />
        </p>
      </div>
      <PublicCtaBand />
    </>
  );
}
